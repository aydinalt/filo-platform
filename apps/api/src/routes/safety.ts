import type { FastifyInstance } from "fastify";
import { createSafetyEventSchema, updateSafetyEventStatusSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const selectEvent=`SELECT e.id,e.assignment_id AS "assignmentId",a.vehicle_id AS "vehicleId",v.plate AS "vehiclePlate",a.driver_id AS "driverId",d.full_name AS "driverName",e.event_type AS "eventType",e.severity,e.occurred_at AS "occurredAt",e.latitude,e.longitude,e.value,e.notes,e.status,e.reviewed_at AS "reviewedAt",e.resolved_at AS "resolvedAt",e.created_at AS "createdAt" FROM driver_safety_events e JOIN vehicle_driver_assignments a ON a.id=e.assignment_id JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id`;
const serialize=(row:Record<string,unknown>)=>({...row,value:row.value===null?null:Number(row.value),occurredAt:(row.occurredAt as Date).toISOString(),reviewedAt:row.reviewedAt instanceof Date?row.reviewedAt.toISOString():null,resolvedAt:row.resolvedAt instanceof Date?row.resolvedAt.toISOString():null,createdAt:(row.createdAt as Date).toISOString()});

export async function safetyRoutes(app:FastifyInstance){
  app.get("/",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const events=(await client.query(`${selectEvent} ORDER BY e.occurred_at DESC LIMIT 500`)).rows.map(serialize);
    const summary=(await client.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='open')::int AS open,count(*) FILTER(WHERE severity IN ('high','critical'))::int AS serious,count(DISTINCT assignment_id)::int AS "assignmentCount" FROM driver_safety_events`)).rows[0];
    return {events,summary};
  }));
  app.post("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=createSafetyEventSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_SAFETY_EVENT"});
    const input=parsed.data,user=request.sessionUser;
    if(Date.parse(input.occurredAt)>Date.now()+300000)return reply.code(400).send({error:"FUTURE_EVENT"});
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      if(!(await client.query("SELECT 1 FROM vehicle_driver_assignments WHERE id=$1",[input.assignmentId])).rowCount)return null;
      const created=(await client.query(`INSERT INTO driver_safety_events(tenant_id,assignment_id,event_type,severity,occurred_at,latitude,longitude,value,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[user.tenantId,input.assignmentId,input.eventType,input.severity,input.occurredAt,input.latitude,input.longitude,input.value,input.notes,user.id])).rows[0];
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'driver_safety_event.created','driver_safety_event',$3,jsonb_build_object('assignmentId',$4,'eventType',$5,'severity',$6))`,[user.tenantId,user.id,created.id,input.assignmentId,input.eventType,input.severity]);
      return serialize((await client.query(`${selectEvent} WHERE e.id=$1`,[created.id])).rows[0]);
    });
    if(!result)return reply.code(404).send({error:"ASSIGNMENT_NOT_FOUND"});return reply.code(201).send({event:result});
  });
  app.patch("/:id/status",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=updateSafetyEventStatusSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_SAFETY_STATUS"});
    const {id}=request.params as {id:string},user=request.sessionUser,status=parsed.data.status;
    const changed=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const result=await client.query(`UPDATE driver_safety_events SET status=$2,reviewed_at=CASE WHEN $2='reviewed' THEN now() ELSE reviewed_at END,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,updated_at=now() WHERE id=$1 AND status<>'resolved' RETURNING id`,[id,status]);if(!result.rowCount)return false;
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'driver_safety_event.status_changed','driver_safety_event',$3,jsonb_build_object('status',$4))`,[user.tenantId,user.id,id,status]);return true;
    });
    if(!changed)return reply.code(404).send({error:"ACTIVE_SAFETY_EVENT_NOT_FOUND"});return reply.code(204).send();
  });
}
