import type { FastifyInstance } from "fastify";
import { createVehicleDocumentSchema, updateVehicleDocumentStatusSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const selectDocument=`SELECT d.id,d.vehicle_id AS "vehicleId",v.plate AS "vehiclePlate",d.document_type AS "documentType",d.document_number AS "documentNumber",d.valid_from AS "validFrom",d.expires_on AS "expiresOn",d.notes,d.status,d.renewed_by_document_id AS "renewedByDocumentId",d.created_at AS "createdAt" FROM vehicle_documents d JOIN vehicles v ON v.id=d.vehicle_id`;
const date=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):value;
const serialize=(row:Record<string,unknown>):Record<string,unknown>=>({...row,validFrom:date(row.validFrom),expiresOn:date(row.expiresOn),createdAt:(row.createdAt as Date).toISOString()});

export async function documentRoutes(app:FastifyInstance){
  app.get("/",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`${selectDocument} ORDER BY CASE WHEN d.status='active' THEN 0 ELSE 1 END,d.expires_on NULLS LAST,d.created_at DESC`)).rows;
    return {documents:rows.map(row=>{const item=serialize(row);const expires=item.expiresOn as string|null;const days=expires===null?null:Math.ceil((Date.parse(`${expires}T00:00:00Z`)-Date.now())/86400000);return {...item,displayStatus:item.status!=='active'?item.status:days===null?'valid':days<0?'expired':days<=30?'expiring_soon':'valid',daysUntilExpiry:days};})};
  }));
  app.post("/",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=createVehicleDocumentSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_VEHICLE_DOCUMENT"});
    const input=parsed.data,user=request.sessionUser;
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      if(!(await client.query("SELECT 1 FROM vehicles WHERE id=$1",[input.vehicleId])).rowCount)return {error:"VEHICLE_NOT_FOUND" as const};
      try{
        const created=(await client.query(`INSERT INTO vehicle_documents(tenant_id,vehicle_id,document_type,document_number,valid_from,expires_on,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[user.tenantId,input.vehicleId,input.documentType,input.documentNumber,input.validFrom,input.expiresOn,input.notes,user.id])).rows[0];
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'vehicle_document.created','vehicle_document',$3,jsonb_build_object('vehicleId',$4,'documentType',$5,'expiresOn',$6))`,[user.tenantId,user.id,created.id,input.vehicleId,input.documentType,input.expiresOn]);
        return {document:serialize((await client.query(`${selectDocument} WHERE d.id=$1`,[created.id])).rows[0])};
      }catch(error){if((error as {code?:string}).code==='23505')return {error:"ACTIVE_DOCUMENT_EXISTS" as const};throw error;}
    });
    if("error" in result)return reply.code(result.error==="VEHICLE_NOT_FOUND"?404:409).send({error:result.error});return reply.code(201).send(result);
  });
  app.patch("/:id/status",{preHandler:[requireSession,allow("owner","admin")]},async(request,reply)=>{
    const parsed=updateVehicleDocumentStatusSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_DOCUMENT_STATUS"});
    const {id}=request.params as {id:string};const user=request.sessionUser;
    const updated=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const result=await client.query(`UPDATE vehicle_documents SET status=$2,updated_at=now() WHERE id=$1 AND status='active' RETURNING id`,[id,parsed.data.status]);if(!result.rowCount)return false;
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'vehicle_document.status_changed','vehicle_document',$3,jsonb_build_object('status',$4))`,[user.tenantId,user.id,id,parsed.data.status]);return true;
    });
    if(!updated)return reply.code(404).send({error:"ACTIVE_DOCUMENT_NOT_FOUND"});return reply.code(204).send();
  });
}
