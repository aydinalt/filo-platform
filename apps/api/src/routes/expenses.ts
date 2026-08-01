import type { FastifyInstance } from "fastify";
import { createVehicleExpenseSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const selectExpense=`SELECT e.id,e.vehicle_id AS "vehicleId",v.plate AS "vehiclePlate",e.category,e.occurred_on AS "occurredOn",e.amount,e.odometer_km AS "odometerKm",e.liters,e.description,e.created_at AS "createdAt" FROM vehicle_expenses e JOIN vehicles v ON v.id=e.vehicle_id`;
const serialize=(row:Record<string,unknown>)=>({...row,occurredOn:(row.occurredOn as Date).toISOString().slice(0,10),amount:Number(row.amount),liters:row.liters===null?null:Number(row.liters),createdAt:(row.createdAt as Date).toISOString()});

export async function expenseRoutes(app:FastifyInstance){
  app.get("/",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`${selectExpense} ORDER BY e.occurred_on DESC,e.created_at DESC LIMIT 500`)).rows;
    const summary=(await client.query(`SELECT COALESCE(sum(amount),0) AS total_amount,COALESCE(sum(amount) FILTER(WHERE category='fuel'),0) AS fuel_amount,COALESCE(sum(liters),0) AS fuel_liters,count(*)::int AS entry_count FROM vehicle_expenses`)).rows[0];
    const byVehicle=(await client.query(`SELECT e.vehicle_id,v.plate,COALESCE(sum(e.amount),0) AS total_amount,COALESCE(sum(e.liters),0) AS fuel_liters,count(*)::int AS entry_count FROM vehicle_expenses e JOIN vehicles v ON v.id=e.vehicle_id GROUP BY e.vehicle_id,v.plate ORDER BY total_amount DESC`)).rows;
    return {expenses:rows.map(serialize),summary:{totalAmount:Number(summary.total_amount),fuelAmount:Number(summary.fuel_amount),fuelLiters:Number(summary.fuel_liters),entryCount:summary.entry_count,byVehicle:byVehicle.map(row=>({vehicleId:row.vehicle_id,vehiclePlate:row.plate,totalAmount:Number(row.total_amount),fuelLiters:Number(row.fuel_liters),entryCount:row.entry_count}))}};
  }));
  app.post("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=createVehicleExpenseSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_VEHICLE_EXPENSE"});
    const input=parsed.data,user=request.sessionUser;
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      if(input.occurredOn>new Date().toISOString().slice(0,10))return {error:"FUTURE_EXPENSE_DATE" as const};
      const vehicle=await client.query("SELECT 1 FROM vehicles WHERE id=$1 AND status<>'inactive'",[input.vehicleId]);if(!vehicle.rowCount)return {error:"ACTIVE_VEHICLE_NOT_FOUND" as const};
      if(input.odometerKm!==null){const latest=await client.query("SELECT max(odometer_km)::int AS km FROM vehicle_expenses WHERE vehicle_id=$1",[input.vehicleId]);if(latest.rows[0].km!==null&&input.odometerKm<latest.rows[0].km)return {error:"ODOMETER_ROLLBACK" as const};}
      const created=(await client.query(`INSERT INTO vehicle_expenses(tenant_id,vehicle_id,category,occurred_on,amount,odometer_km,liters,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[user.tenantId,input.vehicleId,input.category,input.occurredOn,input.amount,input.odometerKm,input.liters,input.description,user.id])).rows[0];
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'expense.created','vehicle_expense',$3,jsonb_build_object('vehicleId',$4,'category',$5,'amount',$6))`,[user.tenantId,user.id,created.id,input.vehicleId,input.category,input.amount]);
      return {expense:serialize((await client.query(`${selectExpense} WHERE e.id=$1`,[created.id])).rows[0])};
    });
    if("error" in result)return reply.code(result.error==="ODOMETER_ROLLBACK"?409:result.error==="ACTIVE_VEHICLE_NOT_FOUND"?404:400).send({error:result.error});
    return reply.code(201).send(result);
  });
}
