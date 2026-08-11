import type { FastifyInstance, FastifyRequest } from "fastify";
import { providerWebhookSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { config } from "../config.js";
import { verifyProviderSignature } from "../lib/provider-signature.js";

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
  provider: string,
  deliveryId: string,
) {
  const result = await query(
    `SELECT profile.id, profile.webhook_secret_env_ref AS "secretRef"
     FROM notification_provider_profiles profile
     JOIN notification_delivery_outbox delivery
       ON delivery.provider_profile_id = profile.id
     WHERE profile.provider = $1
       AND delivery.id = $2
     LIMIT 1`,
    [provider, deliveryId],
  );
  return result.rows[0];
}

type ProviderDeliveryQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: ProviderDelivery[] }>;

export async function lockProviderDelivery(
  query: ProviderDeliveryQuery,
  deliveryId: string,
  profileId: string,
) {
  const result = await query(
    `SELECT status,
            recipient_user_id AS "recipientUserId",
            channel,
            created_at AS "createdAt"
     FROM notification_delivery_outbox
     WHERE id = $1 AND provider_profile_id = $2
     FOR UPDATE`,
    [deliveryId, profileId],
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
    const { tenantId, provider } = request.params as {
      tenantId?: string;
      provider?: string;
    };
    const parsed = providerWebhookSchema.safeParse(request.body);
    const payload = (request as ProviderWebhookRequest).providerRawBody;
    if (!tenantId || !provider || !payload || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_PROVIDER_CALLBACK" });
    }

    const timestamp = request.headers["x-filo-timestamp"] as string | undefined;
    const signature = request.headers["x-filo-signature"] as string | undefined;

    return withTenantTransaction(tenantId, tenantId, async (client) => {
      const profile = await findProviderProfileForDelivery(
        (sql, values) => client.query<ProviderProfile>(sql, values),
        provider,
        parsed.data.deliveryId,
      );
      const secret = profile?.secretRef
        ? process.env[profile.secretRef] ?? ""
        : config.notificationWebhookSecret;
      if (!profile || !verifyProviderSignature(payload, timestamp, signature, secret)) {
        return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
      }

      const lockedDelivery = await lockProviderDelivery(
        (sql, values) => client.query<ProviderDelivery>(sql, values),
        parsed.data.deliveryId,
        profile.id,
      );
      if (!lockedDelivery) {
        return reply.code(401).send({ error: "INVALID_WEBHOOK_SIGNATURE" });
      }

      const event = parsed.data;
      if (!isProviderEventTimePlausible(event.occurredAt, lockedDelivery.createdAt)) {
        return reply.code(400).send({ error: "INVALID_PROVIDER_EVENT_TIME" });
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
        await client.query(
          `UPDATE notification_delivery_outbox
           SET status = $2,
               provider_message_id = COALESCE($3, provider_message_id),
               delivered_at = CASE
                 WHEN $6 = 'delivered'
                   AND (delivered_at IS NULL OR delivered_at > $4::timestamptz)
                 THEN $4::timestamptz
                 ELSE delivered_at
               END,
               updated_at = now()
           WHERE id = $1 AND provider_profile_id = $5`,
          [
            event.deliveryId,
            status,
            event.providerMessageId,
            event.occurredAt,
            profile.id,
            event.event,
          ],
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
