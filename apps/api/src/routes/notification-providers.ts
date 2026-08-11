import type { FastifyInstance } from "fastify";
import {
  createNotificationProviderSchema,
  updateNotificationProviderSchema,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

type ProviderQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: any[]; rowCount?: number | null }>;

type CreateProviderProfileInput = {
  tenantId: string;
  actorUserId: string;
  name: string;
  channel: "email" | "push";
  provider: string;
  credentialEnvRef: string;
  webhookSecretEnvRef: string | null;
  status: "active" | "inactive";
};

const guard = { preHandler: [requireSession, allow("owner", "admin")] };
const select = `SELECT id,name,channel,provider,credential_env_ref AS "credentialEnvRef",webhook_secret_env_ref AS "webhookSecretEnvRef",status,created_at AS "createdAt" FROM notification_provider_profiles`;
const shape = (row: any) => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function lockProviderChannel(
  query: ProviderQuery,
  tenantId: string,
  channel: "email" | "push",
) {
  await query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`,
    [tenantId, channel],
  );
}

export async function createProviderProfile(
  query: ProviderQuery,
  input: CreateProviderProfileInput,
) {
  await lockProviderChannel(query, input.tenantId, input.channel);
  let deactivatedProviderIds: string[] = [];
  if (input.status === "active") {
    const deactivated = await query(
      `UPDATE notification_provider_profiles
       SET status = 'inactive', updated_at = now()
       WHERE tenant_id = $1 AND channel = $2 AND status = 'active'
       RETURNING id`,
      [input.tenantId, input.channel],
    );
    deactivatedProviderIds = deactivated.rows.map((row) => row.id as string);
  }

  const created = await query(
    `INSERT INTO notification_provider_profiles(
       tenant_id,name,channel,provider,credential_env_ref,
       webhook_secret_env_ref,status,created_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.tenantId,
      input.name,
      input.channel,
      input.provider,
      input.credentialEnvRef,
      input.webhookSecretEnvRef,
      input.status,
      input.actorUserId,
    ],
  );
  const providerProfileId = created.rows[0]?.id as string | undefined;
  if (!providerProfileId) {
    throw new Error("notification provider profile insert is missing");
  }

  await query(
    `INSERT INTO audit_events(
       tenant_id,actor_user_id,action,entity_type,entity_id,metadata
     ) VALUES(
       $1,$2,'notification_provider.created','notification_provider',$3,
       jsonb_build_object(
         'channel',$4,'provider',$5,'status',$6,
         'deactivatedProviderIds',$7::jsonb
       )
     )`,
    [
      input.tenantId,
      input.actorUserId,
      providerProfileId,
      input.channel,
      input.provider,
      input.status,
      JSON.stringify(deactivatedProviderIds),
    ],
  );

  if (input.status === "active") {
    await query(
      `INSERT INTO audit_events(
         tenant_id,actor_user_id,action,entity_type,entity_id,metadata
       ) VALUES(
         $1,$2,'notification_provider.rotated','notification_provider',$3,
         jsonb_build_object('channel',$4,'deactivatedProviderIds',$5::jsonb)
       )`,
      [
        input.tenantId,
        input.actorUserId,
        providerProfileId,
        input.channel,
        JSON.stringify(deactivatedProviderIds),
      ],
    );
  }

  return providerProfileId;
}

export function providerCreationConflict(error: unknown) {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code !== "23505") return undefined;
  if (databaseError.constraint === "notification_provider_profiles_tenant_id_name_key") {
    return "PROVIDER_NAME_EXISTS" as const;
  }
  if (databaseError.constraint === "notification_provider_one_active_channel_idx") {
    return "ACTIVE_PROVIDER_CONFLICT" as const;
  }
  return undefined;
}

export async function rotateActiveProvider(
  query: ProviderQuery,
  input: {
    tenantId: string;
    actorUserId: string;
    providerProfileId: string;
    channel: "email" | "push";
  },
) {
  await lockProviderChannel(query, input.tenantId, input.channel);
  const target = await query(
    `SELECT id
     FROM notification_provider_profiles
     WHERE tenant_id = $1 AND channel = $2 AND id = $3
     FOR UPDATE`,
    [input.tenantId, input.channel, input.providerProfileId],
  );
  if (!target.rows[0]) return false;
  const deactivated = await query(
    `UPDATE notification_provider_profiles
     SET status = 'inactive', updated_at = now()
     WHERE tenant_id = $1
       AND channel = $2
       AND status = 'active'
       AND id <> $3
     RETURNING id`,
    [input.tenantId, input.channel, input.providerProfileId],
  );
  const activated = await query(
    `UPDATE notification_provider_profiles
     SET status = 'active', updated_at = now()
     WHERE tenant_id = $1
       AND channel = $2
       AND id = $3
     RETURNING id`,
    [input.tenantId, input.channel, input.providerProfileId],
  );
  if (!activated.rows[0]) return false;
  await query(
    `INSERT INTO audit_events(
       tenant_id, actor_user_id, action, entity_type, entity_id, metadata
     ) VALUES(
       $1, $2, 'notification_provider.rotated', 'notification_provider', $3,
       jsonb_build_object('channel', $4, 'deactivatedProviderIds', $5::jsonb)
     )`,
    [
      input.tenantId,
      input.actorUserId,
      input.providerProfileId,
      input.channel,
      JSON.stringify(deactivated.rows.map((row) => row.id)),
    ],
  );
  return true;
}

export async function changeProviderStatus(
  query: ProviderQuery,
  input: {
    tenantId: string;
    actorUserId: string;
    providerProfileId: string;
    channel: "email" | "push";
    nextStatus: "active" | "inactive";
  },
) {
  await lockProviderChannel(query, input.tenantId, input.channel);
  const current = await query(
    `SELECT status
     FROM notification_provider_profiles
     WHERE tenant_id = $1 AND channel = $2 AND id = $3
     FOR UPDATE`,
    [input.tenantId, input.channel, input.providerProfileId],
  );
  const previousStatus = current.rows[0]?.status as "active" | "inactive" | undefined;
  if (!previousStatus) return "not_found" as const;
  if (previousStatus === input.nextStatus) return "unchanged" as const;

  if (input.nextStatus === "active") {
    const deactivated = await query(
      `UPDATE notification_provider_profiles
       SET status = 'inactive', updated_at = now()
       WHERE tenant_id = $1
         AND channel = $2
         AND status = 'active'
         AND id <> $3
       RETURNING id`,
      [input.tenantId, input.channel, input.providerProfileId],
    );
    await query(
      `UPDATE notification_provider_profiles
       SET status = 'active', updated_at = now()
       WHERE tenant_id = $1 AND channel = $2 AND id = $3`,
      [input.tenantId, input.channel, input.providerProfileId],
    );
    await query(
      `INSERT INTO audit_events(
         tenant_id, actor_user_id, action, entity_type, entity_id, metadata
       ) VALUES(
         $1, $2, 'notification_provider.rotated', 'notification_provider', $3,
         jsonb_build_object('channel', $4, 'deactivatedProviderIds', $5::jsonb)
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.providerProfileId,
        input.channel,
        JSON.stringify(deactivated.rows.map((row) => row.id)),
      ],
    );
  } else {
    await query(
      `UPDATE notification_provider_profiles
       SET status = 'inactive', updated_at = now()
       WHERE tenant_id = $1 AND channel = $2 AND id = $3`,
      [input.tenantId, input.channel, input.providerProfileId],
    );
    await query(
      `INSERT INTO audit_events(
         tenant_id, actor_user_id, action, entity_type, entity_id, metadata
       ) VALUES(
         $1,$2,'notification_provider.status_changed','notification_provider',$3,
         jsonb_build_object('channel',$4,'previousStatus',$5,'nextStatus',$6)
       )`,
      [input.tenantId, input.actorUserId, input.providerProfileId, input.channel,
       previousStatus, input.nextStatus],
    );
  }
  return "changed" as const;
}

export async function notificationProviderRoutes(app: FastifyInstance) {
  app.get("/", guard, async (request) =>
    withTenantTransaction(
      request.sessionUser.tenantId,
      request.sessionUser.id,
      async (client) => ({
        providers: (await client.query(`${select} ORDER BY channel,name`)).rows.map(shape),
      }),
    ),
  );

  app.post("/", guard, async (request, reply) => {
    const parsed = createNotificationProviderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_NOTIFICATION_PROVIDER" });
    }
    const user = request.sessionUser;
    const provider = parsed.data;
    try {
      return await withTenantTransaction(user.tenantId, user.id, async (client) => {
        const providerProfileId = await createProviderProfile(client.query.bind(client), {
          tenantId: user.tenantId,
          actorUserId: user.id,
          ...provider,
        });
        return reply.code(201).send({
          provider: shape(
            (await client.query(`${select} WHERE tenant_id=$1 AND id=$2`, [
              user.tenantId,
              providerProfileId,
            ])).rows[0],
          ),
        });
      });
    } catch (error) {
      const conflict = providerCreationConflict(error);
      if (conflict) return reply.code(409).send({ error: conflict });
      throw error;
    }
  });

  app.patch("/:id", guard, async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    const parsed = updateNotificationProviderSchema.safeParse(request.body);
    if (!id || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_PROVIDER_UPDATE" });
    }
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const current = (
        await client.query(
          `SELECT channel
           FROM notification_provider_profiles
           WHERE tenant_id = $1 AND id = $2`,
          [user.tenantId, id],
        )
      ).rows[0] as { channel: "email" | "push" } | undefined;
      if (!current) return reply.code(404).send({ error: "PROVIDER_NOT_FOUND" });

      const result = await changeProviderStatus(client.query.bind(client), {
        tenantId: user.tenantId,
        actorUserId: user.id,
        providerProfileId: id,
        channel: current.channel,
        nextStatus: parsed.data.status,
      });
      if (result === "not_found") {
        return reply.code(404).send({ error: "PROVIDER_NOT_FOUND" });
      }
      return reply.code(204).send();
    });
  });
}
