import type {FastifyInstance} from "fastify";
import {createNotificationSuppressionSchema} from "@filo/contracts";
import {withTenantTransaction} from "@filo/database";
import {requireSession} from "../lib/auth.js";
import {allow} from "../lib/permissions.js";

const guard={preHandler:[requireSession,allow("owner","admin")]};
const select=`SELECT s.id,s.recipient_user_id AS "recipientUserId",u.full_name AS "recipientName",u.email,s.channel,s.reason,s.details,s.active,s.created_at AS "createdAt",s.lifted_at AS "liftedAt" FROM notification_suppressions s JOIN users u ON u.id=s.recipient_user_id`;
const shape=(row:any)=>({...row,createdAt:row.createdAt.toISOString(),liftedAt:row.liftedAt?.toISOString()??null});

export async function notificationSuppressionRoutes(app:FastifyInstance){
  app.get("/",guard,async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>({suppressions:(await client.query(`${select} ORDER BY s.active DESC,s.created_at DESC`)).rows.map(shape)})));
  app.post("/",guard,async(request,reply)=>{const parsed=createNotificationSuppressionSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_SUPPRESSION"});const user=request.sessionUser,input=parsed.data;return withTenantTransaction(user.tenantId,user.id,async client=>{const recipient=(await client.query(`SELECT id FROM users WHERE id=$1`,[input.recipientUserId])).rows[0];if(!recipient)return reply.code(404).send({error:"RECIPIENT_NOT_FOUND"});const row=(await client.query(`INSERT INTO notification_suppressions(tenant_id,recipient_user_id,channel,reason,details,created_by) VALUES($1,$2,$3,'manual',$4,$5) ON CONFLICT(tenant_id,recipient_user_id,channel) WHERE active DO UPDATE SET details=EXCLUDED.details RETURNING id`,[user.tenantId,input.recipientUserId,input.channel,input.details,user.id])).rows[0];await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_suppression.created','notification_suppression',$3,jsonb_build_object('channel',$4))`,[user.tenantId,user.id,row.id,input.channel]);return reply.code(201).send({suppression:shape((await client.query(`${select} WHERE s.id=$1`,[row.id])).rows[0])});});});
  app.patch("/:id/lift",guard,async(request,reply)=>{const id=(request.params as any).id,user=request.sessionUser;return withTenantTransaction(user.tenantId,user.id,async client=>{const result=await client.query(`UPDATE notification_suppressions SET active=false,lifted_by=$2,lifted_at=now() WHERE id=$1 AND active`,[id,user.id]);if(!result.rowCount)return reply.code(404).send({error:"ACTIVE_SUPPRESSION_NOT_FOUND"});await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'notification_suppression.lifted','notification_suppression',$3)`,[user.tenantId,user.id,id]);return reply.code(204).send();});});
}
