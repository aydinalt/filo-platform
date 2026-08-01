import type { FastifyInstance } from "fastify";
import { reportQuerySchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const csvCell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export async function reportRoutes(app:FastifyInstance){
  async function readReport(request:any,reply:any){
    const parsed=reportQuerySchema.safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:"INVALID_REPORT_RANGE"});
    const {from,to,vehicleId}=parsed.data;const u=request.sessionUser;
    return withTenantTransaction(u.tenantId,u.id,async c=>{
      const rows=(await c.query(`SELECT v.id AS "vehicleId",v.plate AS "vehiclePlate",
        COALESCE((SELECT max(e.odometer_km)-min(e.odometer_km) FROM vehicle_expenses e WHERE e.vehicle_id=v.id AND e.odometer_km IS NOT NULL AND e.occurred_on BETWEEN $1 AND $2),0)::int AS "distanceKm",
        COALESCE((SELECT sum(e.amount) FROM vehicle_expenses e WHERE e.vehicle_id=v.id AND e.occurred_on BETWEEN $1 AND $2),0) AS "totalExpense",
        COALESCE((SELECT sum(e.liters) FROM vehicle_expenses e WHERE e.vehicle_id=v.id AND e.category='fuel' AND e.occurred_on BETWEEN $1 AND $2),0) AS "fuelLiters",
        (SELECT count(*)::int FROM driver_safety_events s JOIN vehicle_driver_assignments a ON a.id=s.assignment_id WHERE a.vehicle_id=v.id AND s.occurred_at::date BETWEEN $1 AND $2) AS "safetyEvents",
        (SELECT count(*)::int FROM vehicle_incidents i WHERE i.vehicle_id=v.id AND i.occurred_at::date BETWEEN $1 AND $2) AS incidents,
        (SELECT count(*)::int FROM vehicle_maintenance_plans m WHERE m.vehicle_id=v.id AND m.status='scheduled' AND m.due_date<current_date) AS "overdueMaintenance",
        (SELECT count(*)::int FROM vehicle_documents d WHERE d.vehicle_id=v.id AND d.status='active' AND d.expires_on<current_date) AS "expiredDocuments",
        (SELECT count(*)::int FROM inspection_defects d JOIN vehicle_inspections i ON i.id=d.inspection_id WHERE i.vehicle_id=v.id AND d.status<>'resolved') AS "openDefects"
        FROM vehicles v WHERE ($3::uuid IS NULL OR v.id=$3) ORDER BY v.plate`,[from,to,vehicleId])).rows.map((r:any)=>({...r,totalExpense:Number(r.totalExpense),fuelLiters:Number(r.fuelLiters)}));
      const summary=rows.reduce((s:any,r:any)=>({vehicleCount:s.vehicleCount+1,distanceKm:s.distanceKm+r.distanceKm,totalExpense:s.totalExpense+r.totalExpense,fuelLiters:s.fuelLiters+r.fuelLiters,safetyEvents:s.safetyEvents+r.safetyEvents,incidents:s.incidents+r.incidents,overdueMaintenance:s.overdueMaintenance+r.overdueMaintenance,expiredDocuments:s.expiredDocuments+r.expiredDocuments,openDefects:s.openDefects+r.openDefects}),{vehicleCount:0,distanceKm:0,totalExpense:0,fuelLiters:0,safetyEvents:0,incidents:0,overdueMaintenance:0,expiredDocuments:0,openDefects:0});
      return {range:{from,to,vehicleId},summary,vehicles:rows};
    });
  }
  app.get("/overview",{preHandler:[requireSession]},readReport);
  app.get("/export.csv",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{const report:any=await readReport(request,reply);if(reply.sent)return;const u=request.sessionUser;await withTenantTransaction(u.tenantId,u.id,async c=>{await c.query(`INSERT INTO report_exports(tenant_id,requested_by,format,date_from,date_to,vehicle_id) VALUES($1,$2,'csv',$3,$4,$5)`,[u.tenantId,u.id,report.range.from,report.range.to,report.range.vehicleId]);await c.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'report.exported','report',$2,jsonb_build_object('from',$3,'to',$4,'format','csv'))`,[u.tenantId,u.id,report.range.from,report.range.to]);});const headers=["Araç","Kilometre","Toplam gider","Yakıt litre","Güvenlik olayı","Kaza/hasar","Geciken bakım","Süresi dolan belge","Açık kusur"];const lines=[headers,...report.vehicles.map((r:any)=>[r.vehiclePlate,r.distanceKm,r.totalExpense,r.fuelLiters,r.safetyEvents,r.incidents,r.overdueMaintenance,r.expiredDocuments,r.openDefects])].map((row:any[])=>row.map(csvCell).join(","));return reply.header("content-type","text/csv; charset=utf-8").header("content-disposition",`attachment; filename=filo-raporu-${report.range.from}-${report.range.to}.csv`).send(`\uFEFF${lines.join("\n")}`);});
}
