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

      const event = parsed.data;
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

      if (inserted.rowCount) {
        const status =
          event.event === "delivered"
            ? "delivered"
            : event.event === "bounced"
              ? "bounced"
              : "complained";
        const delivery = (
          await client.query(
            `UPDATE notification_delivery_outbox
             SET status = $2,
                 provider_message_id = COALESCE($3, provider_message_id),
                 delivered_at = CASE WHEN $2 = 'delivered' THEN $4 ELSE delivered_at END,
                 updated_at = now()
             WHERE id = $1 AND provider_profile_id = $5
             RETURNING recipient_user_id, channel`,
            [event.deliveryId, status, event.providerMessageId, event.occurredAt, profile.id],
          )
        ).rows[0];

        if (delivery && (event.event === "bounced" || event.event === "complained")) {
          await client.query(
            `INSERT INTO notification_suppressions (
               tenant_id, recipient_user_id, channel, reason, source_delivery_id, details
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, recipient_user_id, channel) WHERE active DO NOTHING`,
            [
              tenantId,
              delivery.recipient_user_id,
              delivery.channel,
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
