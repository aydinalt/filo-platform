import assert from "node:assert/strict";
import {describe,it} from "node:test";

process.env.SESSION_SECRET="delivery-preferences-test-session-secret-at-least-32-characters";

const {enqueueNotificationDeliveries,isSupportedTimeZone,updateNotificationPreferencesAndReconcile}=await import("../src/routes/deliveries.js");

describe("notification recipient delivery preferences",()=>{
 it("accepts supported IANA zones and rejects invalid zones before SQL",()=>{
  assert.equal(isSupportedTimeZone("Europe/Istanbul"),true);
  assert.equal(isSupportedTimeZone("America/New_York"),true);
  assert.equal(isSupportedTimeZone("Not/A_Zone"),false);
 });

 it("uses default channels without a preference row and schedules quiet hours in recipient time",async()=>{
  const tenantId="10000000-0000-4000-8000-000000000001";
  const calls:Array<{sql:string;values?:unknown[]}>=[];
  const candidate={
   id:"20000000-0000-4000-8000-000000000002",tenantId,
   recipientUserId:"30000000-0000-4000-8000-000000000003",sourceType:"maintenance",
   title:"Bakım",message:"Bakım zamanı",recipientName:"Test Kullanıcı",timezone:"America/New_York",
   quietEnabled:true,quietStart:"22:00",quietEnd:"07:00",channel:"email" as const,
  };
  const created=await enqueueNotificationDeliveries(async(sql,values)=>{
   calls.push({sql,values});
   if(calls.length===1)return{rows:[candidate]};
   if(calls.length===2)return{rows:[]};
   return{rows:[],rowCount:1};
  },tenantId);
  assert.equal(created,1);
  assert.match(calls[0].sql,/LEFT JOIN notification_preferences/u);
  assert.match(calls[0].sql,/COALESCE\(p\.email_enabled,true\)/u);
  assert.match(calls[0].sql,/COALESCE\(p\.push_enabled,true\)/u);
  assert.match(calls[0].sql,/LEFT JOIN pg_timezone_names zone/u);
  assert.match(calls[0].sql,/COALESCE\(zone\.name,'Europe\/Istanbul'\)/u);
  assert.match(calls[0].sql,/WHERE n\.tenant_id=\$1/u);
  assert.deepEqual(calls[0].values,[tenantId]);
  assert.match(calls[1].sql,/WHERE tenant_id=\$1/u);
  assert.match(calls[2].sql,/now\(\) AT TIME ZONE \$8::text/u);
  assert.match(calls[2].sql,/\$6::time>\$7::time/u);
  assert.match(calls[2].sql,/\(now\(\) AT TIME ZONE \$8::text\)::date\+1\+\$7::time/u);
 assert.deepEqual(calls[2].values?.slice(4,8),[true,"22:00","07:00","America/New_York"]);
 });

 it("reconciles queued deliveries atomically when preferences change",async()=>{
  const tenantId="10000000-0000-4000-8000-000000000001";
  const userId="30000000-0000-4000-8000-000000000003";
  const calls:Array<{sql:string;values?:unknown[]}>=[];
  const result=await updateNotificationPreferencesAndReconcile(async(sql,values)=>{
   calls.push({sql,values});
   if(calls.length===2)return{rows:[]};
   if(calls.length===4)return{rows:[],rowCount:2};
   if(calls.length===5)return{rows:[],rowCount:1};
   return{rows:[],rowCount:1};
  },{tenantId,userId,preferences:{emailEnabled:false,pushEnabled:true,quietHoursEnabled:true,quietStart:"22:00",quietEnd:"07:00",timezone:"America/New_York"}});
  assert.deepEqual(result,{cancelled:2,deferred:1});
  assert.match(calls[0].sql,/pg_advisory_xact_lock/u);
  assert.deepEqual(calls[0].values,[tenantId,userId]);
  assert.match(calls[1].sql,/WHERE tenant_id=\$1 AND user_id=\$2 FOR UPDATE/u);
  assert.match(calls[2].sql,/ON CONFLICT\(tenant_id,user_id\) DO UPDATE/u);
  assert.match(calls[3].sql,/RECIPIENT_CHANNEL_DISABLED/u);
  assert.match(calls[3].sql,/delivery\.status IN \('pending','failed'\)/u);
  assert.doesNotMatch(calls[3].sql,/processing/u);
  assert.match(calls[4].sql,/available_at=GREATEST\(delivery\.available_at/u);
  assert.match(calls[4].sql,/now\(\) AT TIME ZONE \$8::text/u);
  assert.deepEqual(calls[4].values,[tenantId,userId,false,true,true,"22:00","07:00","America/New_York"]);
  assert.match(calls[5].sql,/cancelledQueuedDeliveries/u);
  assert.match(calls[5].sql,/deferredQueuedDeliveries/u);
  assert.deepEqual(calls[5].values?.slice(-2),[2,1]);
 });
});
