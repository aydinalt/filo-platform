import type {FastifyInstance} from "fastify";
import {deliveryCompletionParamsSchema,deliveryOperatorActionSchema,deliveryQuerySchema,updateNotificationPreferencesSchema} from "@filo/contracts";
import {withTenantTransaction} from "@filo/database";
import {requireSession} from "../lib/auth.js";
import {allow} from "../lib/permissions.js";
import {renderTemplate} from "../lib/template-renderer.js";

const preferencesSelect=`SELECT email_enabled AS "emailEnabled",push_enabled AS "pushEnabled",quiet_hours_enabled AS "quietHoursEnabled",to_char(quiet_start,'HH24:MI') AS "quietStart",to_char(quiet_end,'HH24:MI') AS "quietEnd",timezone,updated_at AS "updatedAt" FROM notification_preferences WHERE user_id=$1`;
const deliverySelect=`SELECT o.id,o.notification_id AS "notificationId",n.title,o.recipient_user_id AS "recipientUserId",u.full_name AS "recipientName",o.channel,o.status,o.attempt_count AS "attemptCount",o.available_at AS "availableAt",o.delivered_at AS "deliveredAt",o.last_error AS "lastError",o.created_at AS "createdAt" FROM notification_delivery_outbox o JOIN in_app_notifications n ON n.id=o.notification_id JOIN users u ON u.id=o.recipient_user_id`;
const shape=(row:any)=>({...row,updatedAt:row.updatedAt?.toISOString()??null,availableAt:row.availableAt?.toISOString(),deliveredAt:row.deliveredAt?.toISOString()??null,createdAt:row.createdAt?.toISOString()});

type DeliveryOperationQuery=(sql:string,values?:unknown[])=>Promise<{rows:unknown[];rowCount?:number|null}>;
type DeliveryCandidate={id:string;tenantId:string;recipientUserId:string;sourceType:string;title:string;message:string;recipientName:string;timezone:string;quietEnabled:boolean;quietStart:string|null;quietEnd:string|null;channel:"email"|"push"};

export function isSupportedTimeZone(timezone:string){
 try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format();return true;}catch{return false;}
}

export async function enqueueNotificationDeliveries(query:DeliveryOperationQuery,tenantId:string){
 const candidates=(await query(`SELECT n.id,n.tenant_id AS "tenantId",n.recipient_user_id AS "recipientUserId",n.source_type AS "sourceType",n.title,n.message,u.full_name AS "recipientName",
    COALESCE(zone.name,'Europe/Istanbul') AS timezone,
    COALESCE(p.quiet_hours_enabled,false) AS "quietEnabled",
    p.quiet_start AS "quietStart",p.quiet_end AS "quietEnd",x.channel
   FROM in_app_notifications n
   JOIN users u ON u.id=n.recipient_user_id
   LEFT JOIN notification_preferences p ON p.tenant_id=n.tenant_id AND p.user_id=n.recipient_user_id
   LEFT JOIN pg_timezone_names zone ON zone.name=p.timezone
   CROSS JOIN LATERAL (VALUES
     ('email',COALESCE(p.email_enabled,true)),
     ('push',COALESCE(p.push_enabled,true))
   ) x(channel,enabled)
   WHERE n.tenant_id=$1
     AND x.enabled
     AND n.archived_at IS NULL
     AND n.source_type NOT IN ('provider_incident','archive_reconciliation')
     AND n.created_at>=now()-interval '30 days'
     AND NOT EXISTS(
       SELECT 1 FROM notification_delivery_outbox o
       WHERE o.tenant_id=n.tenant_id
         AND o.notification_id=n.id
         AND o.recipient_user_id=n.recipient_user_id
         AND o.channel=x.channel
     )`,[tenantId])).rows as DeliveryCandidate[];
 let created=0;
 for(const item of candidates){
  const locale="tr-TR",key=`notification.${item.sourceType}`;
  const template=(await query(`SELECT id,subject_template AS "subjectTemplate",body_template AS "bodyTemplate"
    FROM notification_templates
    WHERE tenant_id=$1 AND key=$2 AND channel=$3 AND status='active' AND locale IN ($4,'tr-TR')
    ORDER BY (locale=$4) DESC LIMIT 1`,[tenantId,key,item.channel,locale])).rows[0] as {id:string;subjectTemplate:string;bodyTemplate:string}|undefined;
  const variables={title:item.title,message:item.message,recipientName:item.recipientName};
  const subject=template?renderTemplate(template.subjectTemplate,variables):item.title;
  const body=template?renderTemplate(template.bodyTemplate,variables):item.message;
  const result=await query(`INSERT INTO notification_delivery_outbox(
      tenant_id,notification_id,recipient_user_id,channel,available_at,template_id,locale,rendered_subject,rendered_body
    ) VALUES(
      $1,$2,$3,$4,
      CASE WHEN $5::boolean AND $6::time IS NOT NULL AND $7::time IS NOT NULL AND (
        ($6::time<$7::time AND (now() AT TIME ZONE $8::text)::time>=$6::time AND (now() AT TIME ZONE $8::text)::time<$7::time)
        OR
        ($6::time>$7::time AND ((now() AT TIME ZONE $8::text)::time>=$6::time OR (now() AT TIME ZONE $8::text)::time<$7::time))
      ) THEN (
        CASE WHEN $6::time>$7::time AND (now() AT TIME ZONE $8::text)::time>=$6::time
          THEN (now() AT TIME ZONE $8::text)::date+1+$7::time
          ELSE (now() AT TIME ZONE $8::text)::date+$7::time
        END
      ) AT TIME ZONE $8::text
      ELSE now() END,
      $9,$10,$11,$12
    ) ON CONFLICT DO NOTHING`,[item.tenantId,item.id,item.recipientUserId,item.channel,item.quietEnabled,item.quietStart,item.quietEnd,item.timezone,template?.id??null,locale,subject,body]);
  created+=result.rowCount??0;
 }
 return created;
}

export async function applyDeliveryOperatorAction(query:DeliveryOperationQuery,input:{tenantId:string;deliveryId:string;actorUserId:string;action:"retry"|"cancel";reason:string}){
 const result=await query(`WITH candidate AS (
   SELECT id,status
   FROM notification_delivery_outbox
   WHERE tenant_id=$1
     AND id=$2
     AND (
       ($3='retry' AND status='failed' AND attempt_count<10)
       OR ($3='cancel' AND status IN ('pending','failed'))
     )
   FOR UPDATE
  ), changed AS (
   UPDATE notification_delivery_outbox delivery
   SET status=CASE WHEN $3='retry' THEN 'pending' ELSE 'cancelled' END,
       available_at=CASE WHEN $3='retry' THEN now() ELSE delivery.available_at END,
       last_error=CASE WHEN $3='retry' THEN NULL ELSE $4 END,
       delivered_at=NULL,
       lease_token=NULL,
       lease_expires_at=NULL,
       locked_at=NULL,
       locked_by=NULL,
       updated_at=now()
   FROM candidate
   WHERE delivery.tenant_id=$1
     AND delivery.id=candidate.id
   RETURNING delivery.id,candidate.status AS previous_status,delivery.status AS next_status
  )
  INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  SELECT $1,$5,'notification_delivery.operator_action','notification_delivery',id,
         jsonb_build_object('operation',$3,'reason',$4,'previousStatus',previous_status,'nextStatus',next_status)
  FROM changed`,[input.tenantId,input.deliveryId,input.action,input.reason,input.actorUserId]);
 return result.rowCount===1;
}

export async function deliveryRoutes(app:FastifyInstance){
 app.get("/preferences",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async c=>{const row=(await c.query(preferencesSelect,[request.sessionUser.id])).rows[0];return{preferences:row?shape(row):{emailEnabled:true,pushEnabled:true,quietHoursEnabled:false,quietStart:null,quietEnd:null,timezone:"Europe/Istanbul",updatedAt:null}};}));
 app.put("/preferences",{preHandler:requireSession},async(request,reply)=>{const parsed=updateNotificationPreferencesSchema.safeParse(request.body);if(!parsed.success||!isSupportedTimeZone(parsed.data.timezone))return reply.code(400).send({error:"INVALID_NOTIFICATION_PREFERENCES"});const user=request.sessionUser;return withTenantTransaction(user.tenantId,user.id,async c=>{const p=parsed.data;await c.query(`INSERT INTO notification_preferences(tenant_id,user_id,email_enabled,push_enabled,quiet_hours_enabled,quiet_start,quiet_end,timezone) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,user_id) DO UPDATE SET email_enabled=$3,push_enabled=$4,quiet_hours_enabled=$5,quiet_start=$6,quiet_end=$7,timezone=$8,updated_at=now()`,[user.tenantId,user.id,p.emailEnabled,p.pushEnabled,p.quietHoursEnabled,p.quietStart,p.quietEnd,p.timezone]);await c.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_preferences.updated','user',$2,'{}')`,[user.tenantId,user.id]);return reply.code(204).send();});});
 app.post("/enqueue",{preHandler:[requireSession,allow("owner","admin","operator")]},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async c=>{
  const created=await enqueueNotificationDeliveries(((sql:string,values?:unknown[])=>c.query(sql,values)) as DeliveryOperationQuery,request.sessionUser.tenantId);
  await c.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_deliveries.enqueued','notification_delivery',$2,jsonb_build_object('created',$3))`,[request.sessionUser.tenantId,request.sessionUser.id,created]);return{created};
 }));
 app.get("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{const parsed=deliveryQuerySchema.safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:"INVALID_DELIVERY_QUERY"});return withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async c=>{const params:any[]=[];const where=parsed.data.status==="all"?"":` WHERE o.status=$1`;if(where)params.push(parsed.data.status);return{deliveries:(await c.query(`${deliverySelect}${where} ORDER BY o.created_at DESC LIMIT 500`,params)).rows.map(shape)};});});
 app.get("/metrics",{preHandler:[requireSession,allow("owner","admin","operator")]},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async c=>{const row=(await c.query(`SELECT count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE status='processing')::int AS processing,count(*) FILTER(WHERE status='delivered')::int AS delivered,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='cancelled')::int AS cancelled,count(*) FILTER(WHERE status IN ('pending','failed') AND available_at<=now())::int AS ready,min(available_at) FILTER(WHERE status IN ('pending','failed') AND available_at<=now()) AS "oldestReadyAt" FROM notification_delivery_outbox`)).rows[0];return{metrics:{...row,oldestReadyAt:row.oldestReadyAt?.toISOString()??null}};}));
 app.patch("/:id",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{const route=deliveryCompletionParamsSchema.safeParse(request.params),parsed=deliveryOperatorActionSchema.safeParse(request.body);if(!route.success||!parsed.success)return reply.code(400).send({error:"INVALID_DELIVERY_ACTION"});const user=request.sessionUser;const changed=await withTenantTransaction(user.tenantId,user.id,async c=>applyDeliveryOperatorAction(((sql:string,values?:unknown[])=>c.query(sql,values)) as DeliveryOperationQuery,{tenantId:user.tenantId,deliveryId:route.data.id,actorUserId:user.id,...parsed.data}));return changed?reply.code(204).send():reply.code(409).send({error:"DELIVERY_ACTION_NOT_ALLOWED"});});
}
