import type { FastifyInstance } from "fastify";
import { completeMaintenanceSchema, createMaintenancePlanSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const selectPlan=`SELECT p.id,p.vehicle_id AS "vehicleId",v.plate AS "vehiclePlate",p.title,p.due_date AS "dueDate",
 p.due_odometer_km AS "dueOdometerKm",p.status,p.notes,p.completed_at AS "completedAt",
 p.completed_odometer_km AS "completedOdometerKm",p.created_at AS "createdAt",
 CASE WHEN p.status='scheduled' AND p.due_date<CURRENT_DATE THEN 'overdue'
      WHEN p.status='scheduled' AND p.due_date<=CURRENT_DATE+INTERVAL '14 days' THEN 'due_soon'
      ELSE p.status END AS "displayStatus"
 FROM vehicle_maintenance_plans p JOIN vehicles v ON v.id=p.vehicle_id`;

export async function maintenanceRoutes(app:FastifyInstance){
  app.get("/",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`${selectPlan} ORDER BY CASE WHEN p.status='scheduled' THEN 0 ELSE 1 END,p.due_date NULLS LAST,p.created_at DESC`)).rows;
    return {plans:rows.map(row=>({...row,dueDate:row.dueDate?.toISOString().slice(0,10)??null,completedAt:row.completedAt?.toISOString()??null,createdAt:row.createdAt.toISOString()}))};
  }));
  app.post("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=createMaintenancePlanSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_MAINTENANCE_PLAN"});
    const user=request.sessionUser;
    try{const row=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const vehicle=await client.query("SELECT 1 FROM vehicles WHERE id=$1 AND status<>'inactive'",[parsed.data.vehicleId]);if(!vehicle.rowCount)return null;
      const created=(await client.query(`INSERT INTO vehicle_maintenance_plans(tenant_id,vehicle_id,title,due_date,due_odometer_km,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[user.tenantId,parsed.data.vehicleId,parsed.data.title,parsed.data.dueDate,parsed.data.dueOdometerKm,parsed.data.notes,user.id])).rows[0];
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'maintenance.scheduled','maintenance_plan',$3,jsonb_build_object('vehicleId',$4,'title',$5))`,[user.tenantId,user.id,created.id,parsed.data.vehicleId,parsed.data.title]);
      return (await client.query(`${selectPlan} WHERE p.id=$1`,[created.id])).rows[0];
    });if(!row)return reply.code(404).send({error:"ACTIVE_VEHICLE_NOT_FOUND"});return reply.code(201).send({plan:{...row,dueDate:row.dueDate?.toISOString().slice(0,10)??null,completedAt:null,createdAt:row.createdAt.toISOString()}});
    }catch(error){if((error as {code?:string}).code==="23505")return reply.code(409).send({error:"ACTIVE_MAINTENANCE_PLAN_EXISTS"});throw error;}
  });
  app.patch("/:id/complete",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const id=(request.params as {id?:string}).id,parsed=completeMaintenanceSchema.safeParse(request.body);if(!id||!parsed.success)return reply.code(400).send({error:"INVALID_MAINTENANCE_COMPLETION"});
    const user=request.sessionUser;const changed=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const result=await client.query(`UPDATE vehicle_maintenance_plans SET status='completed',completed_at=now(),completed_by=$2,completed_odometer_km=$3,updated_at=now() WHERE id=$1 AND status='scheduled' RETURNING vehicle_id,title`,[id,user.id,parsed.data.completedOdometerKm]);
      if(!result.rowCount)return false;await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'maintenance.completed','maintenance_plan',$3,jsonb_build_object('vehicleId',$4,'title',$5,'odometerKm',$6))`,[user.tenantId,user.id,id,result.rows[0].vehicle_id,result.rows[0].title,parsed.data.completedOdometerKm]);return true;
    });return changed?reply.code(204).send():reply.code(404).send({error:"SCHEDULED_MAINTENANCE_NOT_FOUND"});
  });
}
