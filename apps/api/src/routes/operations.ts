import type { FastifyInstance } from "fastify";
import { createAssignmentSchema, startShiftSchema, updateTrackingSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const assignmentSelect = `SELECT a.id,a.tenant_id AS "tenantId",a.vehicle_id AS "vehicleId",
 v.plate AS "vehiclePlate",a.driver_id AS "driverId",r.full_name AS "driverName",
 a.device_id AS "deviceId",d.model AS "deviceModel",a.starts_at AS "startsAt",
 a.ended_at AS "endedAt",a.created_at AS "createdAt"
 FROM vehicle_driver_assignments a JOIN vehicles v ON v.id=a.vehicle_id
 JOIN drivers r ON r.id=a.driver_id LEFT JOIN devices d ON d.id=a.device_id`;

export async function operationRoutes(app: FastifyInstance) {
  app.get("/assignments", { preHandler: requireSession }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const rows = (await client.query(`${assignmentSelect} ORDER BY a.created_at DESC`)).rows;
      return { assignments: rows.map(r => ({...r, startsAt:r.startsAt.toISOString(), endedAt:r.endedAt?.toISOString()??null, createdAt:r.createdAt.toISOString()})) };
    }));

  app.post("/assignments", { preHandler: [requireSession, allow("owner","admin","operator")] }, async (request, reply) => {
    const parsed=createAssignmentSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    try {
      const assignment=await withTenantTransaction(user.tenantId,user.id,async(client)=>{
        const valid=await client.query(`SELECT
          EXISTS(SELECT 1 FROM vehicles WHERE id=$1 AND status='active') AS vehicle,
          EXISTS(SELECT 1 FROM drivers WHERE id=$2 AND status='active') AS driver,
          ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM devices WHERE id=$3 AND status='active' AND (driver_id IS NULL OR driver_id=$2))) AS device`,
          [parsed.data.vehicleId,parsed.data.driverId,parsed.data.deviceId]);
        if(!valid.rows[0]?.vehicle||!valid.rows[0]?.driver||!valid.rows[0]?.device) return null;
        const inserted=await client.query<{id:string}>(`INSERT INTO vehicle_driver_assignments
          (tenant_id,vehicle_id,driver_id,device_id,starts_at,created_by)
          VALUES($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6) RETURNING id`,
          [user.tenantId,parsed.data.vehicleId,parsed.data.driverId,parsed.data.deviceId,parsed.data.startsAt??null,user.id]);
        const id=inserted.rows[0]!.id;
        await client.query(`INSERT INTO tracking_statuses(assignment_id,tenant_id,updated_by) VALUES($1,$2,$3)`,[id,user.tenantId,user.id]);
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
          VALUES($1,$2,'assignment.created','assignment',$3,jsonb_build_object('vehicleId',$4,'driverId',$5))`,
          [user.tenantId,user.id,id,parsed.data.vehicleId,parsed.data.driverId]);
        return (await client.query(`${assignmentSelect} WHERE a.id=$1`,[id])).rows[0];
      });
      if(!assignment) return reply.code(400).send({error:"ASSIGNMENT_REFERENCE_INVALID"});
      return reply.code(201).send({assignment:{...assignment,startsAt:assignment.startsAt.toISOString(),endedAt:null,createdAt:assignment.createdAt.toISOString()}});
    } catch(error) {
      if((error as {code?:string}).code==="23505") return reply.code(409).send({error:"ACTIVE_ASSIGNMENT_CONFLICT"});
      throw error;
    }
  });

  app.patch("/assignments/:id/end", { preHandler:[requireSession,allow("owner","admin","operator")] }, async(request,reply)=>{
    const id=(request.params as {id?:string}).id; if(!id) return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    const ended=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const activeShift=await client.query("SELECT 1 FROM work_shifts WHERE assignment_id=$1 AND status='active'",[id]);
      if(activeShift.rowCount) return "shift";
      const result=await client.query("UPDATE vehicle_driver_assignments SET ended_at=now() WHERE id=$1 AND ended_at IS NULL RETURNING id",[id]);
      if(!result.rowCount) return null;
      await client.query("UPDATE tracking_statuses SET state='off',updated_at=now(),updated_by=$2 WHERE assignment_id=$1",[id,user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'assignment.ended','assignment',$3)`,[user.tenantId,user.id,id]);
      return "ok";
    });
    if(ended==="shift") return reply.code(409).send({error:"ACTIVE_SHIFT_EXISTS"});
    if(!ended) return reply.code(404).send({error:"ASSIGNMENT_NOT_FOUND"});
    return reply.code(204).send();
  });

  app.get("/shifts", {preHandler:requireSession}, async request =>
    withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
      const rows=(await client.query(`SELECT s.id,s.assignment_id AS "assignmentId",v.plate AS "vehiclePlate",
        d.full_name AS "driverName",s.started_at AS "startedAt",s.ended_at AS "endedAt",s.status
        FROM work_shifts s JOIN vehicle_driver_assignments a ON a.id=s.assignment_id
        JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id ORDER BY s.started_at DESC`)).rows;
      return {shifts:rows.map(r=>({...r,startedAt:r.startedAt.toISOString(),endedAt:r.endedAt?.toISOString()??null}))};
    }));

  app.post("/shifts", {preHandler:[requireSession,allow("owner","admin","operator")]}, async(request,reply)=>{
    const parsed=startShiftSchema.safeParse(request.body); if(!parsed.success)return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    try {
      const shift=await withTenantTransaction(user.tenantId,user.id,async client=>{
        const assignment=await client.query("SELECT 1 FROM vehicle_driver_assignments WHERE id=$1 AND ended_at IS NULL",[parsed.data.assignmentId]);
        if(!assignment.rowCount)return null;
        const row=(await client.query(`INSERT INTO work_shifts(tenant_id,assignment_id,started_by) VALUES($1,$2,$3) RETURNING id`,[user.tenantId,parsed.data.assignmentId,user.id])).rows[0];
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'shift.started','shift',$3)`,[user.tenantId,user.id,row.id]);
        return row;
      });
      if(!shift)return reply.code(404).send({error:"ACTIVE_ASSIGNMENT_NOT_FOUND"});
      return reply.code(201).send({shift});
    } catch(error){if((error as {code?:string}).code==="23505")return reply.code(409).send({error:"ACTIVE_SHIFT_CONFLICT"});throw error;}
  });

  app.patch("/shifts/:id/end",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const id=(request.params as {id?:string}).id;if(!id)return reply.code(400).send({error:"INVALID_INPUT"});const user=request.sessionUser;
    const found=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const row=await client.query(`UPDATE work_shifts SET status='completed',ended_at=now(),ended_by=$2 WHERE id=$1 AND status='active' RETURNING assignment_id`,[id,user.id]);
      if(!row.rowCount)return false;
      await client.query("UPDATE tracking_statuses SET state='off',updated_at=now(),updated_by=$2 WHERE assignment_id=$1",[row.rows[0].assignment_id,user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'shift.ended','shift',$3)`,[user.tenantId,user.id,id]);return true;
    });return found?reply.code(204).send():reply.code(404).send({error:"ACTIVE_SHIFT_NOT_FOUND"});
  });

  app.get("/tracking",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`SELECT assignment_id AS "assignmentId",permission,state,error_code AS "errorCode",updated_at AS "updatedAt" FROM tracking_statuses ORDER BY updated_at DESC`)).rows;
    return {tracking:rows.map(r=>({...r,updatedAt:r.updatedAt.toISOString()}))};
  }));
  app.patch("/tracking/:assignmentId",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=updateTrackingSchema.safeParse(request.body), assignmentId=(request.params as {assignmentId?:string}).assignmentId;
    if(!parsed.success||!assignmentId)return reply.code(400).send({error:"INVALID_INPUT"});const user=request.sessionUser;
    let state=parsed.data.state;
    if(["denied","restricted"].includes(parsed.data.permission)) state="permission_revoked";
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const row=await client.query(`UPDATE tracking_statuses SET permission=$1,state=$2,error_code=$3,updated_at=now(),updated_by=$4
        WHERE assignment_id=$5 RETURNING assignment_id`,[parsed.data.permission,state,parsed.data.errorCode??null,user.id,assignmentId]);
      if(!row.rowCount)return false;
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'tracking.status_changed','assignment',$3,jsonb_build_object('permission',$4,'state',$5))`,[user.tenantId,user.id,assignmentId,parsed.data.permission,state]);return true;
    });return result?{tracking:{assignmentId,permission:parsed.data.permission,state,errorCode:parsed.data.errorCode??null}}:reply.code(404).send({error:"ASSIGNMENT_NOT_FOUND"});
  });
}
