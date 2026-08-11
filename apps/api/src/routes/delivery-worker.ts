import type { FastifyInstance } from "fastify";
import {
  claimDeliveriesSchema,
  completeDeliverySchema,
  deliveryCompletionParamsSchema,
  renewDeliveryLeaseSchema,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireNotificationWorker, retryDelayMinutes } from "../lib/worker-auth.js";

type QueryResult<Row = Record<string, unknown>> = {
  rows: Row[];
  rowCount?: number | null;
};

type DeliveryWorkerQuery = <Row = Record<string, unknown>>(
  sql: string,
  values?: unknown[],
) => Promise<QueryResult<Row>>;

type ClaimedDeliveryRow = {
  id: string;
  leaseToken: string;
  notificationId: string;
  recipientUserId: string;
  recipientEmail: string;
  channel: "email" | "push";
  providerProfileId: string;
  provider: string;
  credentialEnvRef: string;
  title: string;
  message: string;
  locale: string;
  attemptCount: number;
  leaseExpiresAt: Date | string;
};

type LockedDelivery = {
  attemptCount: number;
  providerMessageId: string | null;
  providerProfileId: string;
};

type CompletionReceipt = {
  outcome: "delivered" | "failed";
  providerMessageId: string | null;
  error: string | null;
};

type RenewedDeliveryLease = {
  leaseExpiresAt: Date | string;
};

const workerGuard = { preHandler: requireNotificationWorker };

export async function isOperationalDeliveryWorkerActor(
  query: DeliveryWorkerQuery,
  tenantId: string,
  actorUserId: string,
) {
  const result = await query(
    `SELECT 1
     FROM memberships membership
     JOIN users actor ON actor.id = membership.user_id
     WHERE membership.tenant_id = $1
       AND membership.user_id = $2
       AND membership.role IN ('owner', 'admin', 'operator')
       AND actor.disabled_at IS NULL`,
    [tenantId, actorUserId],
  );
  return Boolean(result.rows[0]);
}

export async function reconcileExpiredDeliveryLeases(
  query: DeliveryWorkerQuery,
  tenantId: string,
) {
  const result = await query(
    `WITH expired_candidates AS (
       SELECT id, attempt_count, locked_by, lease_token, provider_profile_id
       FROM notification_delivery_outbox
       WHERE tenant_id = $1
         AND status = 'processing'
         AND lease_expires_at <= now()
       FOR UPDATE
     ), expired AS (
       UPDATE notification_delivery_outbox delivery
       SET status = CASE
             WHEN candidate.attempt_count >= 10 THEN 'cancelled'
             ELSE 'failed'
           END,
           last_error = 'DELIVERY_LEASE_EXPIRED',
           available_at = CASE
             WHEN candidate.attempt_count < 10
             THEN now() + LEAST(
               interval '1 hour',
               interval '1 minute' * power(2, GREATEST(candidate.attempt_count - 1, 0))
             )
             ELSE delivery.available_at
           END,
           lease_token = NULL,
           lease_expires_at = NULL,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = now()
       FROM expired_candidates candidate
       WHERE delivery.tenant_id = $1
         AND delivery.id = candidate.id
       RETURNING delivery.id,
                 candidate.attempt_count,
                 candidate.locked_by,
                 candidate.lease_token,
                 candidate.provider_profile_id
     )
     INSERT INTO notification_delivery_attempts (
       tenant_id, delivery_id, outcome, provider_message_id, error,
       attempt_number, worker_id, lease_token_hash, provider_profile_id
     )
     SELECT $1, id, 'failed', NULL, 'DELIVERY_LEASE_EXPIRED',
            attempt_count, locked_by,
            encode(digest(lease_token::text, 'sha256'), 'hex'),
            provider_profile_id
     FROM expired`,
    [tenantId],
  );
  return result.rowCount ?? 0;
}

export async function cancelSuppressedQueuedDeliveries(
  query: DeliveryWorkerQuery,
  tenantId: string,
) {
  const result = await query(
    `UPDATE notification_delivery_outbox delivery
     SET status = 'cancelled',
         last_error = 'RECIPIENT_SUPPRESSED',
         lease_token = NULL,
         lease_expires_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE delivery.tenant_id = $1
       AND delivery.status IN ('pending', 'failed')
       AND EXISTS (
         SELECT 1
         FROM notification_suppressions suppression
         WHERE suppression.tenant_id = delivery.tenant_id
           AND suppression.recipient_user_id = delivery.recipient_user_id
           AND suppression.channel = delivery.channel
           AND suppression.active
       )`,
    [tenantId],
  );
  return result.rowCount ?? 0;
}

export async function cancelPreferenceDisabledQueuedDeliveries(
  query: DeliveryWorkerQuery,
  tenantId: string,
) {
  const result = await query(
    `UPDATE notification_delivery_outbox delivery
     SET status = 'cancelled',
         last_error = 'RECIPIENT_CHANNEL_DISABLED',
         lease_token = NULL,
         lease_expires_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE delivery.tenant_id = $1
       AND delivery.status IN ('pending', 'failed')
       AND EXISTS (
         SELECT 1
         FROM notification_preferences preference
         WHERE preference.tenant_id = delivery.tenant_id
           AND preference.user_id = delivery.recipient_user_id
           AND (
             (delivery.channel = 'email' AND NOT preference.email_enabled)
             OR (delivery.channel = 'push' AND NOT preference.push_enabled)
           )
       )`,
    [tenantId],
  );
  return result.rowCount ?? 0;
}

export async function cancelInactiveRecipientDeliveries(
  query: DeliveryWorkerQuery,
  tenantId: string,
) {
  const result = await query(
    `UPDATE notification_delivery_outbox delivery
     SET status = 'cancelled',
         last_error = 'RECIPIENT_INACTIVE',
         lease_token = NULL,
         lease_expires_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE delivery.tenant_id = $1
       AND delivery.status IN ('pending', 'failed')
       AND NOT EXISTS (
         SELECT 1
         FROM users recipient
         JOIN memberships membership
           ON membership.user_id = recipient.id
          AND membership.tenant_id = delivery.tenant_id
         WHERE recipient.id = delivery.recipient_user_id
           AND recipient.disabled_at IS NULL
       )`,
    [tenantId],
  );
  return result.rowCount ?? 0;
}

export async function claimDeliveryBatch(
  query: DeliveryWorkerQuery,
  input: {
    tenantId: string;
    workerId: string;
    limit: number;
  },
) {
  const result = await query<ClaimedDeliveryRow>(
    `WITH candidates AS (
       SELECT delivery.id,
              provider.id AS provider_id,
              provider.provider,
              provider.credential_env_ref
       FROM notification_delivery_outbox delivery
       JOIN notification_provider_profiles provider
         ON provider.tenant_id = delivery.tenant_id
        AND provider.channel = delivery.channel
        AND (
          provider.id = delivery.provider_profile_id
          OR (delivery.provider_profile_id IS NULL AND provider.status = 'active')
        )
       WHERE delivery.tenant_id = $1
         AND delivery.status IN ('pending', 'failed')
         AND delivery.available_at <= now()
         AND delivery.attempt_count < 10
         AND delivery.rendered_body IS NOT NULL
         AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at < now())
         AND NOT EXISTS (
           SELECT 1
           FROM notification_suppressions suppression
           WHERE suppression.tenant_id = delivery.tenant_id
             AND suppression.recipient_user_id = delivery.recipient_user_id
             AND suppression.channel = delivery.channel
             AND suppression.active
         )
         AND NOT EXISTS (
           SELECT 1
           FROM notification_preferences preference
           WHERE preference.tenant_id = delivery.tenant_id
             AND preference.user_id = delivery.recipient_user_id
             AND (
               (delivery.channel = 'email' AND NOT preference.email_enabled)
               OR (delivery.channel = 'push' AND NOT preference.push_enabled)
             )
         )
       ORDER BY delivery.available_at, delivery.id
       FOR UPDATE OF delivery SKIP LOCKED
       LIMIT $2
     )
     UPDATE notification_delivery_outbox delivery
     SET status = 'processing',
         locked_at = now(),
         locked_by = $3,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + interval '5 minutes',
         attempt_count = attempt_count + 1,
         provider_profile_id = COALESCE(delivery.provider_profile_id, candidates.provider_id),
         updated_at = now()
     FROM candidates, users recipient
     WHERE delivery.tenant_id = $1
       AND delivery.id = candidates.id
       AND recipient.id = delivery.recipient_user_id
       AND recipient.disabled_at IS NULL
       AND EXISTS (
         SELECT 1
         FROM memberships membership
         WHERE membership.tenant_id = delivery.tenant_id
           AND membership.user_id = recipient.id
       )
     RETURNING delivery.id,
               delivery.lease_token AS "leaseToken",
               delivery.notification_id AS "notificationId",
               delivery.recipient_user_id AS "recipientUserId",
               recipient.email AS "recipientEmail",
               delivery.channel,
               candidates.provider_id AS "providerProfileId",
               candidates.provider,
               candidates.credential_env_ref AS "credentialEnvRef",
               delivery.rendered_subject AS title,
               delivery.rendered_body AS message,
               delivery.locale,
               delivery.attempt_count AS "attemptCount",
               delivery.lease_expires_at AS "leaseExpiresAt"`,
    [input.tenantId, input.limit, input.workerId],
  );
  return result.rows;
}

export async function lockDeliveryForCompletion(
  query: DeliveryWorkerQuery,
  tenantId: string,
  deliveryId: string,
  leaseToken: string,
  workerId: string,
) {
  const result = await query<LockedDelivery>(
    `SELECT attempt_count AS "attemptCount",
            provider_message_id AS "providerMessageId",
            provider_profile_id AS "providerProfileId"
     FROM notification_delivery_outbox
     WHERE tenant_id = $1
       AND id = $2
       AND lease_token = $3
       AND locked_by = $4
       AND status = 'processing'
       AND lease_expires_at > now()
     FOR UPDATE`,
    [tenantId, deliveryId, leaseToken, workerId],
  );
  return result.rows[0];
}

export async function renewClaimedDeliveryLease(
  query: DeliveryWorkerQuery,
  input: {
    tenantId: string;
    deliveryId: string;
    leaseToken: string;
    workerId: string;
  },
) {
  const result = await query<RenewedDeliveryLease>(
    `UPDATE notification_delivery_outbox
     SET lease_expires_at = GREATEST(
           lease_expires_at,
           LEAST(locked_at + interval '15 minutes', now() + interval '5 minutes')
         ),
         updated_at = now()
     WHERE tenant_id = $1
       AND id = $2
       AND lease_token = $3
       AND locked_by = $4
       AND status = 'processing'
       AND locked_at IS NOT NULL
       AND lease_expires_at > now()
       AND now() < locked_at + interval '15 minutes'
     RETURNING lease_expires_at AS "leaseExpiresAt"`,
    [input.tenantId, input.deliveryId, input.leaseToken, input.workerId],
  );
  return result.rows[0];
}

export async function findCompletionReceipt(
  query: DeliveryWorkerQuery,
  tenantId: string,
  deliveryId: string,
  leaseToken: string,
  workerId: string,
) {
  const result = await query<CompletionReceipt>(
    `SELECT outcome,
            provider_message_id AS "providerMessageId",
            error
     FROM notification_delivery_attempts
     WHERE tenant_id = $1
       AND delivery_id = $2
       AND lease_token_hash = encode(digest(($3::uuid)::text, 'sha256'), 'hex')
       AND worker_id = $4
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [tenantId, deliveryId, leaseToken, workerId],
  );
  return result.rows[0];
}

export function isCompletionReplayConsistent(
  receipt: CompletionReceipt,
  supplied: Pick<CompletionReceipt, "outcome" | "providerMessageId" | "error">,
) {
  return (
    receipt.outcome === supplied.outcome &&
    receipt.providerMessageId === supplied.providerMessageId &&
    receipt.error === supplied.error
  );
}

export function isCompletionProviderMessageIdConsistent(
  recordedMessageId: string | null,
  suppliedMessageId: string | null,
) {
  return (
    recordedMessageId === null ||
    suppliedMessageId === null ||
    recordedMessageId === suppliedMessageId
  );
}

export async function completeClaimedDelivery(
  query: DeliveryWorkerQuery,
  input: {
    tenantId: string;
    deliveryId: string;
    leaseToken: string;
    workerId: string;
    outcome: "delivered" | "failed";
    providerMessageId: string | null;
    error: string | null;
    attemptCount: number;
    providerProfileId: string;
  },
) {
  const status =
    input.outcome === "delivered"
      ? "delivered"
      : input.attemptCount >= 10
        ? "cancelled"
        : "failed";
  const retryDelay = retryDelayMinutes(input.attemptCount);
  const updated = await query(
    `UPDATE notification_delivery_outbox
     SET status = $3,
         delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE NULL END,
         last_error = $4,
         available_at = CASE
           WHEN $3 = 'failed' THEN now() + ($5 || ' minutes')::interval
           ELSE available_at
         END,
         provider_message_id = CASE
           WHEN $3 = 'delivered' THEN COALESCE(provider_message_id, $6)
           ELSE provider_message_id
         END,
         lease_token = NULL,
         lease_expires_at = NULL,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now()
     WHERE tenant_id = $1
       AND id = $2
       AND lease_token = $7
       AND locked_by = $8
       AND status = 'processing'
       AND lease_expires_at > now()`,
    [
      input.tenantId,
      input.deliveryId,
      status,
      input.error,
      retryDelay,
      input.providerMessageId,
      input.leaseToken,
      input.workerId,
    ],
  );
  if (updated.rowCount !== 1) return false;

  await query(
    `INSERT INTO notification_delivery_attempts (
       tenant_id, delivery_id, outcome, provider_message_id, error,
       attempt_number, worker_id, lease_token_hash, provider_profile_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       encode(digest(($8::uuid)::text, 'sha256'), 'hex'), $9
     )`,
    [
      input.tenantId,
      input.deliveryId,
      input.outcome,
      input.providerMessageId,
      input.error,
      input.attemptCount,
      input.workerId,
      input.leaseToken,
      input.providerProfileId,
    ],
  );
  return true;
}

export async function deliveryWorkerRoutes(app: FastifyInstance) {
  app.post("/claim", workerGuard, async (request, reply) => {
    const parsed = claimDeliveriesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_CLAIM_REQUEST" });
    }
    const input = parsed.data;
    return withTenantTransaction(input.tenantId, input.actorUserId, async (client) => {
      const query = ((sql: string, values?: unknown[]) =>
        client.query(sql, values)) as DeliveryWorkerQuery;
      if (!(await isOperationalDeliveryWorkerActor(query, input.tenantId, input.actorUserId))) {
        return reply.code(403).send({ error: "INVALID_DELIVERY_WORKER_ACTOR" });
      }
      await reconcileExpiredDeliveryLeases(query, input.tenantId);
      await cancelInactiveRecipientDeliveries(query, input.tenantId);
      await cancelSuppressedQueuedDeliveries(query, input.tenantId);
      await cancelPreferenceDisabledQueuedDeliveries(query, input.tenantId);
      const rows = await claimDeliveryBatch(query, input);
      return {
        deliveries: rows.map((row) => ({
          ...row,
          leaseExpiresAt: new Date(row.leaseExpiresAt).toISOString(),
        })),
      };
    });
  });

  app.post("/:id/lease/renew", workerGuard, async (request, reply) => {
    const route = deliveryCompletionParamsSchema.safeParse(request.params);
    const parsed = renewDeliveryLeaseSchema.safeParse(request.body);
    if (!route.success || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_LEASE_RENEWAL_REQUEST" });
    }
    const input = parsed.data;
    return withTenantTransaction(input.tenantId, input.actorUserId, async (client) => {
      const query = ((sql: string, values?: unknown[]) =>
        client.query(sql, values)) as DeliveryWorkerQuery;
      if (!(await isOperationalDeliveryWorkerActor(query, input.tenantId, input.actorUserId))) {
        return reply.code(403).send({ error: "INVALID_DELIVERY_WORKER_ACTOR" });
      }
      const lease = await renewClaimedDeliveryLease(query, {
        ...input,
        deliveryId: route.data.id,
      });
      if (!lease) {
        return reply.code(409).send({ error: "DELIVERY_LEASE_NOT_RENEWABLE" });
      }
      return {
        leaseExpiresAt: new Date(lease.leaseExpiresAt).toISOString(),
      };
    });
  });

  app.post("/:id/complete", workerGuard, async (request, reply) => {
    const route = deliveryCompletionParamsSchema.safeParse(request.params);
    const parsed = completeDeliverySchema.safeParse(request.body);
    if (!route.success || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_COMPLETION_REQUEST" });
    }
    const input = parsed.data;
    return withTenantTransaction(input.tenantId, input.actorUserId, async (client) => {
      const query = ((sql: string, values?: unknown[]) =>
        client.query(sql, values)) as DeliveryWorkerQuery;
      if (!(await isOperationalDeliveryWorkerActor(query, input.tenantId, input.actorUserId))) {
        return reply.code(403).send({ error: "INVALID_DELIVERY_WORKER_ACTOR" });
      }
      const delivery = await lockDeliveryForCompletion(
        query,
        input.tenantId,
        route.data.id,
        input.leaseToken,
        input.workerId,
      );
      if (!delivery) {
        const receipt = await findCompletionReceipt(
          query,
          input.tenantId,
          route.data.id,
          input.leaseToken,
          input.workerId,
        );
        if (receipt && isCompletionReplayConsistent(receipt, input)) {
          return reply.code(204).send();
        }
        if (receipt) {
          return reply.code(409).send({ error: "DELIVERY_COMPLETION_CONFLICT" });
        }
        return reply.code(409).send({ error: "DELIVERY_LEASE_INVALID_OR_EXPIRED" });
      }
      if (
        !isCompletionProviderMessageIdConsistent(
          delivery.providerMessageId,
          input.providerMessageId,
        )
      ) {
        return reply.code(409).send({ error: "PROVIDER_MESSAGE_ID_CONFLICT" });
      }
      const completed = await completeClaimedDelivery(query, {
        ...input,
        deliveryId: route.data.id,
        attemptCount: delivery.attemptCount,
        providerProfileId: delivery.providerProfileId,
      });
      if (!completed) {
        return reply.code(409).send({ error: "DELIVERY_LEASE_INVALID_OR_EXPIRED" });
      }
      return reply.code(204).send();
    });
  });

  app.get("/health", workerGuard, async () => ({
    status: "ok",
    adapter: "dry-run",
    providerConfigured: false,
  }));
}
