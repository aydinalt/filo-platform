import type { FastifyInstance, FastifyRequest } from "fastify";
import { providerWebhookParamsSchema, providerWebhookSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { config } from "../config.js";
import {
  isProviderSignatureEnvelopePlausible,
  verifyProviderSignature,
} from "../lib/provider-signature.js";

type ProviderWebhookRequest = FastifyRequest & {
  providerRawBody?: string;
};

type ProviderProfile = {
  id: string;
  secretRef: string | null;
};

type ProviderEventType = "delivered" | "bounced" | "complained";

type ProviderDelivery = {
  status: string;
  recipientUserId: string;
  channel: string;
  createdAt: Date | string;
  providerMessageId: string | null;
};

type StoredProviderEvent = {
  deliveryId: string;
  eventType: ProviderEventType;
  providerMessageId: string | null;
  occurredAt: Date | string;
};

type ProviderProfileQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: ProviderProfile[] }>;

export async function findProviderProfileForDelivery(
  query: ProviderProfileQuery,
  tenantId: string,
  provider: string,
  deliveryId: string,
) {
  const result = await query(
    `SELECT profile.id, profile.webhook_secret_env_ref AS "secretRef"
     FROM notification_provider_profiles profile
     JOIN notification_delivery_outbox delivery
       ON delivery.provider_profile_id = profile.id
      AND delivery.tenant_id = profile.tenant_id
     WHERE profile.tenant_id = $1
       AND delivery.tenant_id = $1
       AND profile.provider = $2
       AND delivery.id = $3
     LIMIT 1`,
    [tenantId, provider, deliveryId],
  );
  return result.rows[0];
}

type ProviderDeliveryQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: ProviderDelivery[] }>;

export async function lockProviderDelivery(
  query: ProviderDeliveryQuery,
  tenantId: string,
  deliveryId: string,
  profileId: string,
) {
  const result = await query(
    `SELECT status,
            recipient_user_id AS "recipientUserId",
            channel,
            created_at AS "createdAt",
            provider_message_id AS "providerMessageId"
     FROM notification_delivery_outbox
     WHERE tenant_id = $1
       AND id = $2
       AND provider_profile_id = $3
     FOR UPDATE`,
    [tenantId, deliveryId, profileId],
  );
  return result.rows[0];
}

const providerEventClockSkewMs = 5 * 60 * 1000;

export function isProviderEventTimePlausible(
  occurredAt: Date | string,
  deliveryCreatedAt: Date | string,
  receivedAt = Date.now(),
) {
  const eventTime = new Date(occurredAt).getTime();
  const deliveryTime = new Date(deliveryCreatedAt).getTime();
  return (
    Number.isFinite(eventTime) &&
    Number.isFinite(deliveryTime) &&
    eventTime >= deliveryTime - providerEventClockSkewMs &&
    eventTime <= receivedAt + providerEventClockSkewMs
  );
}

const providerEventStatusRank: Record<ProviderEventType, number> = {
  delivered: 1,
  bounced: 2,
  complained: 3,
};

export function nextProviderDeliveryStatus(
  currentStatus: string,
  eventType: ProviderEventType,
) {
  const currentRank =
    currentStatus in providerEventStatusRank
      ? providerEventStatusRank[currentStatus as ProviderEventType]
      : 0;
  return providerEventStatusRank[eventType] > currentRank ? eventType : currentStatus;
}

export function isProviderMessageIdConsistent(
  recordedMessageId: string | null,
  callbackMessageId: string | null,
) {
  return (
    recordedMessageId === null ||
    callbackMessageId === null ||
    recordedMessageId === callbackMessageId
  );
}

export function resolveProviderWebhookSecret(
  profile: ProviderProfile,
  fallbackSecret: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const secret = profile.secretRef ? environment[profile.secretRef] : fallbackSecret;
  return secret && secret.length >= 16 ? secret : null;
}

type ProviderDeliveryUpdateQuery = (
  sql: string,
  values: unknown[],
) => Promise<unknown>;

export async function updateProviderDeliveryFromEvent(
  query: ProviderDeliveryUpdateQuery,
  tenantId: string,
  profileId: string,
  event: {
    deliveryId: string;
    event: ProviderEventType;
    providerMessageId: string | null;
    occurredAt: string;
  },
  status: string,
) {
  await query(
    `UPDATE notification_delivery_outbox
     SET status = $2,
         provider_message_id = COALESCE(provider_message_id, $3),
         delivered_at = CASE
           WHEN $7 = 'delivered'
             AND (delivered_at IS NULL OR delivered_at > $4::timestamptz)
           THEN $4::timestamptz
           ELSE delivered_at
         END,
         updated_at = now()
     WHERE tenant_id = $5
       AND id = $1
       AND provider_profile_id = $6`,
    [
      event.deliveryId,
      status,
      event.providerMessageId,
      event.occurredAt,
      tenantId,
      profileId,
      event.event,
    ],
  );
}

type ProviderEventQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: StoredProviderEvent[] }>;

export async function findProviderEventById(
  query: ProviderEventQuery,
  tenantId: string,
  profileId: string,
  eventId: string,
) {
  const result = await query(
    `SELECT delivery_id AS "deliveryId",
            event_type AS "eventType",
            provider_message_id AS "providerMessageId",
            occurred_at AS "occurredAt"
     FROM notification_provider_events
     WHERE tenant_id = $1
       AND provider_profile_id = $2
       AND provider_event_id = $3
     LIMIT 1`,
    [tenantId, profileId, eventId],
  );
  return result.rows[0];
}

export function isSameProviderEvent(
  stored: StoredProviderEvent,
  incoming: {
    deliveryId: string;
    event: ProviderEventType;
    providerMessageId: string | null;
    occurredAt: string;
  },
) {
  return (
    stored.deliveryId === incoming.deliveryId &&
    stored.eventType === incoming.event &&
    stored.providerMessageId === incoming.providerMessageId &&
    new Date(stored.occurredAt).getTime() === new Date(incoming.occurredAt).getTime()
  );
}

export function registerProviderWebhookJsonParser(app: FastifyInstance) {
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const rawBody = typeof body === "string" ? body : body.toString("utf8");
      (request as ProviderWebhookRequest).providerRawBody = rawBody;
      parseJson(request, rawBody, done);
    },
  );
}

export async function providerWebhookRoutes(app: FastifyInstance) {
  registerProviderWebhookJsonParser(app);

  app.post("/:tenantId/:provider", async (request, reply) => {
    const receivedAt = Date.now();
    const route = providerWebhookParamsSchema.safeParse(request.params);
    const parsed = providerWebhookSchema.safeParse(request.body);
    const payload = (request as ProviderWebhookRequest).providerRawBody;
    if (!route.success || !payload || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_PROVIDER_CALLBACK" });
    }
    const { tenantId, provider } = route.data;

    const timestamp = request.headers["x-filo-timestamp"] as string | undefined;
    const signature = request.headers["x-filo-signature"] as string | undefined;
    if (!isProviderSignatureEnvelopePlausible(timestamp, signature, receivedAt)) {
      return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
    }

    return withTenantTransaction(tenantId, tenantId, async (client) => {
      const profile = await findProviderProfileForDelivery(
        (sql, values) => client.query<ProviderProfile>(sql, values),
        tenantId,
        provider,
        parsed.data.deliveryId,
      );
      if (!profile) {
        return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
      }
      const secret = resolveProviderWebhookSecret(
        profile,
        config.notificationWebhookSecret,
      );
      if (!secret) {
        request.log.error(
          { providerProfileId: profile.id },
          "provider webhook secret unavailable",
        );
        return reply
          .header("retry-after", "60")
          .code(503)
          .send({ error: "PROVIDER_WEBHOOK_UNAVAILABLE" });
      }
      if (!verifyProviderSignature(payload, timestamp, signature, secret, receivedAt)) {
        return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
      }

      const lockedDelivery = await lockProviderDelivery(
        (sql, values) => client.query<ProviderDelivery>(sql, values),
        tenantId,
        parsed.data.deliveryId,
        profile.id,
      );
      if (!lockedDelivery) {
        return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
      }

      const event = parsed.data;
      if (
        !isProviderEventTimePlausible(
          event.occurredAt,
          lockedDelivery.createdAt,
          receivedAt,
        )
      ) {
        return reply.code(400).send({ error: "INVALID_PROVIDER_EVENT_TIME" });
      }
      if (
        !isProviderMessageIdConsistent(
          lockedDelivery.providerMessageId,
          event.providerMessageId,
        )
      ) {
        return reply.code(409).send({ error: "PROVIDER_MESSAGE_ID_CONFLICT" });
      }
      const inserted = await client.query(
        `INSERT INTO notification_provider_events (
           tenant_id, provider_profile_id, provider_event_id, delivery_id,
           event_type, provider_message_id, occurred_at, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, provider_profile_id, provider_event_id) DO NOTHING`,
        [
          tenantId,
          profile.id,
          event.eventId,
          event.deliveryId,
          event.event,
          event.providerMessageId,
          event.occurredAt,
          event.metadata,
        ],
      );

      if (!inserted.rowCount) {
        const existingEvent = await findProviderEventById(
          (sql, values) => client.query<StoredProviderEvent>(sql, values),
          tenantId,
          profile.id,
          event.eventId,
        );
        if (!existingEvent || !isSameProviderEvent(existingEvent, event)) {
          return reply.code(409).send({ error: "PROVIDER_EVENT_ID_CONFLICT" });
        }
      }

      if (inserted.rowCount) {
        const status = nextProviderDeliveryStatus(lockedDelivery.status, event.event);
        await updateProviderDeliveryFromEvent(
          (sql, values) => client.query(sql, values),
          tenantId,
          profile.id,
          event,
          status,
        );

        if (event.event === "bounced" || event.event === "complained") {
          await client.query(
            `INSERT INTO notification_suppressions (
               tenant_id, recipient_user_id, channel, reason, source_delivery_id, details
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, recipient_user_id, channel) WHERE active DO NOTHING`,
            [
              tenantId,
              lockedDelivery.recipientUserId,
              lockedDelivery.channel,
              event.event === "bounced" ? "hard_bounce" : "complaint",
              event.deliveryId,
              event.metadata?.reason ?? null,
            ],
          );
        }
      }

      return reply
        .code(inserted.rowCount ? 202 : 200)
        .send({ accepted: true, duplicate: !inserted.rowCount });
    });
  });
}
