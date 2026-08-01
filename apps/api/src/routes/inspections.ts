import type { FastifyInstance } from "fastify";
import { createVehicleInspectionSchema, updateInspectionDefectStatusSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

export async function inspectionRoutes(app:FastifyInstance){
  app.get("/",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`SELECT i.id,i.assignment_id AS "assignmentId",a.vehicle_id AS "vehicleId",v.plate AS "vehiclePlate",a.driver_id AS "driverId",d.full_name AS "driverName",i.inspection_type AS "inspectionType",i.odometer_km AS "odometerKm",i.safe_to_operate AS "safeToOperate",i.notes,i.inspected_at AS "inspectedAt",COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'item',x.item,'severity',x.severity,'description',x.description,'status',x.status,'resolutionNotes',x.resolution_notes,'reviewedAt',x.reviewed_at,'resolvedAt',x.resolved_at) ORDER BY x.created_at) FILTER(WHERE x.id IS NOT NULL),'[]') AS defects FROM vehicle_inspections i JOIN vehicle_driver_assignments a ON a.id=i.assignment_id JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id LEFT JOIN inspection_defects x ON x.inspection_id=i.id GROUP BY i.id,a.vehicle_id,v.plate,a.driver_id,d.full_name ORDER BY i.inspected_at DESC LIMIT 300`)).rows;
    const inspections=rows.map(row=>({...row,odometerKm:row.odometerKm===null?null:Number(row.odometerKm),inspectedAt:(row.inspectedAt as Date).toISOString(),defects:(row.defects as Array<Record<string,unknown>>).map(x=>({...x,reviewedAt:x.reviewedAt instanceof Date?x.reviewedAt.toISOString():x.reviewedAt,resolvedAt:x.resolvedAt instanceof Date?x.resolvedAt.toISOString():x.resolvedAt}))}));
    const summary=(await client.query(`SELECT (SELECT count(*)::int FROM vehicle_inspections) AS total,(SELECT count(*)::int FROM vehicle_inspections WHERE NOT safe_to_operate) AS unsafe,count(*) FILTER(WHERE status<>'resolved')::int AS "openDefects",count(*) FILTER(WHERE status<>'resolved' AND severity='critical')::int AS "criticalDefects" FROM inspection_defects`)).rows[0];
    return {inspections,summary};
  }));
  app.post("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=createVehicleInspectionSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_INSPECTION"});
    const input=parsed.data,user=request.sessionUser;
    const id=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const assignment=(await client.query(`SELECT a.id FROM vehicle_driver_assignments a WHERE a.id=$1 AND a.ended_at IS NULL`,[input.assignmentId])).rows[0];if(!assignment)return null;
      const inspection=(await client.query(`INSERT INTO vehicle_inspections(tenant_id,assignment_id,inspection_type,odometer_km,safe_to_operate,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[user.tenantId,input.assignmentId,input.inspectionType,input.odometerKm,input.safeToOperate,input.notes,user.id])).rows[0];
      for(const defect of input.defects)await client.query(`INSERT INTO inspection_defects(tenant_id,inspection_id,item,severity,description) VALUES($1,$2,$3,$4,$5)`,[user.tenantId,inspection.id,defect.item,defect.severity,defect.description]);
      if(!input.safeToOperate)await client.query(`UPDATE vehicles SET status='maintenance',updated_at=now() WHERE id=(SELECT vehicle_id FROM vehicle_driver_assignments WHERE id=$1)`,[input.assignmentId]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'vehicle_inspection.created','vehicle_inspection',$3,jsonb_build_object('safeToOperate',$4,'defectCount',$5))`,[user.tenantId,user.id,inspection.id,input.safeToOperate,input.defects.length]);return inspection.id as string;
    });if(!id)return reply.code(404).send({error:"ACTIVE_ASSIGNMENT_NOT_FOUND"});return reply.code(201).send({inspectionId:id});
  });
  app.patch("/defects/:id/status",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=updateInspectionDefectStatusSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_DEFECT_STATUS"});const {id}=request.params as {id:string},user=request.sessionUser;
    const changed=await withTenantTransaction(user.tenantId,user.id,async client=>{const result=await client.query(`UPDATE inspection_defects SET status=$2,resolution_notes=$3,reviewed_at=CASE WHEN $2='reviewed' THEN now() ELSE reviewed_at END,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,updated_at=now() WHERE id=$1 AND status<>'resolved' RETURNING id`,[id,parsed.data.status,parsed.data.resolutionNotes]);if(!result.rowCount)return false;await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'inspection_defect.status_changed','inspection_defect',$3,jsonb_build_object('status',$4))`,[user.tenantId,user.id,id,parsed.data.status]);return true;});if(!changed)return reply.code(404).send({error:"ACTIVE_DEFECT_NOT_FOUND"});return reply.code(204).send();
  });
}
