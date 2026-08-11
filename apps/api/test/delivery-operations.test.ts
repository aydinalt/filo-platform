import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SESSION_SECRET="delivery-operations-test-session-secret-at-least-32-characters";

const {applyDeliveryOperatorAction}=await import("../src/routes/deliveries.js");

describe("notification delivery operator actions",()=>{
 it("retries only eligible failures without consuming another attempt",async()=>{
  const input={tenantId:"10000000-0000-4000-8000-000000000001",deliveryId:"20000000-0000-4000-8000-000000000002",actorUserId:"30000000-0000-4000-8000-000000000003",action:"retry" as const,reason:"PROVIDER_TIMEOUT"};
  const changed=await applyDeliveryOperatorAction(async(sql,values)=>{
   assert.match(sql,/WHERE tenant_id=\$1/u);
   assert.match(sql,/\$3='retry' AND status='failed' AND attempt_count<10/u);
   assert.match(sql,/\$3='cancel' AND status IN \('pending','failed'\)/u);
   assert.match(sql,/status=CASE WHEN \$3='retry' THEN 'pending' ELSE 'cancelled' END/u);
   assert.match(sql,/available_at=CASE WHEN \$3='retry' THEN now\(\)/u);
   assert.match(sql,/last_error=CASE WHEN \$3='retry' THEN NULL ELSE \$4 END/u);
   assert.doesNotMatch(sql,/attempt_count\s*=/u);
   assert.match(sql,/lease_token=NULL/u);
   assert.match(sql,/locked_by=NULL/u);
   assert.match(sql,/notification_delivery\.operator_action/u);
   assert.match(sql,/previousStatus/u);
   assert.match(sql,/nextStatus/u);
   assert.deepEqual(values,[input.tenantId,input.deliveryId,input.action,input.reason,input.actorUserId]);
   return {rows:[],rowCount:1};
  },input);
  assert.equal(changed,true);
 });

 it("reports a conflict when the current lifecycle state is not eligible",async()=>{
  const changed=await applyDeliveryOperatorAction(async()=>({rows:[],rowCount:0}),{
   tenantId:"10000000-0000-4000-8000-000000000001",
   deliveryId:"20000000-0000-4000-8000-000000000002",
   actorUserId:"30000000-0000-4000-8000-000000000003",
   action:"cancel",
   reason:"OPERATOR_CANCELLED",
  });
  assert.equal(changed,false);
 });
});
