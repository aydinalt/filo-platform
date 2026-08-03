import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNotificationProviderSchema, createNotificationSuppressionSchema, deliveryQuerySchema, providerWebhookSchema, updateDeliveryStatusSchema, updateNotificationPreferencesSchema } from "@filo/contracts";
import { actionQuerySchema, createActionItemSchema, updateActionItemSchema, createNotificationRuleSchema, notificationQuerySchema, createAlertRuleSchema, createAssignmentSchema, createDeviceSchema, createDriverSchema, createGeofenceSchema, createLocationEventSchema, createMaintenancePlanSchema, createSafetyEventSchema, createTireSetSchema, createVehicleDocumentSchema, createVehicleExpenseSchema, createVehicleIncidentSchema, createVehicleInspectionSchema, createVehicleSchema, loginSchema, mountTireSetSchema, removeTireSetSchema, reportQuerySchema, updateInspectionDefectStatusSchema, updateMemberRoleSchema, updateTrackingSchema, updateVehicleIncidentSchema } from "@filo/contracts";

describe("API contracts", () => {
  it("validates manual notification suppressions",()=>{assert.equal(createNotificationSuppressionSchema.safeParse({recipientUserId:"10000000-0000-4000-8000-000000000001",channel:"email",details:"requested by owner"}).success,true);assert.equal(createNotificationSuppressionSchema.safeParse({recipientUserId:"bad",channel:"sms"}).success,false);});
  it("validates provider references and delivery webhook events",()=>{
    const provider={name:"Primary email",channel:"email",provider:"resend",credentialEnvRef:"FILO_EMAIL_PROVIDER_KEY",webhookSecretEnvRef:"FILO_EMAIL_WEBHOOK_SECRET",status:"active"};
    assert.equal(createNotificationProviderSchema.safeParse(provider).success,true);
    assert.equal(createNotificationProviderSchema.safeParse({...provider,credentialEnvRef:"actual-secret-value"}).success,false);
    const callback={eventId:"evt-1",deliveryId:"10000000-0000-4000-8000-000000000001",event:"bounced",occurredAt:new Date().toISOString(),metadata:{reason:"mailbox_full"}};
    assert.equal(providerWebhookSchema.safeParse(callback).success,true);
    assert.equal(providerWebhookSchema.safeParse({...callback,event:"opened"}).success,false);
  });
  it("validates delivery preferences, filters and terminal updates",()=>{
    const base={emailEnabled:true,pushEnabled:false,quietHoursEnabled:true,quietStart:"22:00",quietEnd:"07:00",timezone:"Europe/Istanbul"};
    assert.equal(updateNotificationPreferencesSchema.safeParse(base).success,true);
    assert.equal(updateNotificationPreferencesSchema.safeParse({...base,quietStart:null}).success,false);
    assert.equal(deliveryQuerySchema.safeParse({status:"failed"}).success,true);
    assert.equal(deliveryQuerySchema.safeParse({status:"unknown"}).success,false);
    assert.equal(updateDeliveryStatusSchema.safeParse({status:"failed",error:null}).success,false);
    assert.equal(updateDeliveryStatusSchema.safeParse({status:"failed",error:"Provider timeout"}).success,true);
  });
  it("validates notification rules and inbox filters",()=>{
    assert.equal(createNotificationRuleSchema.safeParse({name:"Aksiyon son tarihi",sourceType:"action",leadDays:7,severity:"warning",targetRole:"operator"}).success,true);
    assert.equal(createNotificationRuleSchema.safeParse({name:"X",sourceType:"unknown",leadDays:500,severity:"urgent"}).success,false);
    assert.equal(notificationQuerySchema.safeParse({status:"unread",severity:"critical"}).success,true);
    assert.equal(notificationQuerySchema.safeParse({status:"deleted"}).success,false);
  });
  it("validates action priorities, states and filters",()=>{
    assert.equal(createActionItemSchema.safeParse({title:"Muayeneyi yenile",priority:"high",vehicleId:null,assignedUserId:null,dueOn:"2026-08-10"}).success,true);
    assert.equal(createActionItemSchema.safeParse({title:"X",priority:"urgent"}).success,false);
    assert.equal(updateActionItemSchema.safeParse({status:"completed",assignedUserId:null,dueOn:null}).success,true);
    assert.equal(actionQuerySchema.safeParse({status:"unknown"}).success,false);
  });
  it("validates bounded operational report ranges",()=>{
    assert.equal(reportQuerySchema.safeParse({from:"2026-07-01",to:"2026-08-01"}).success,true);
    assert.equal(reportQuerySchema.safeParse({from:"2026-08-02",to:"2026-08-01"}).success,false);
    assert.equal(reportQuerySchema.safeParse({from:"2025-01-01",to:"2026-08-01"}).success,false);
  });
  it("validates vehicle incidents and requires resolution notes",()=>{
    const vehicleId="10000000-0000-4000-8000-000000000001";
    const base={vehicleId,driverId:null,incidentType:"accident",severity:"major",occurredAt:new Date().toISOString(),description:"Arka tampon hasarı",injuryReported:false};
    assert.equal(createVehicleIncidentSchema.safeParse(base).success,true);
    assert.equal(createVehicleIncidentSchema.safeParse({...base,incidentType:"damage",injuryReported:true}).success,false);
    assert.equal(updateVehicleIncidentSchema.safeParse({status:"resolved",resolutionNotes:null}).success,false);
    assert.equal(updateVehicleIncidentSchema.safeParse({status:"resolved",resolutionNotes:"Onarım tamamlandı"}).success,true);
  });
  it("validates tire lifecycle targets and mount odometers",()=>{
    const vehicleId="10000000-0000-4000-8000-000000000001";
    assert.equal(createTireSetSchema.safeParse({brand:"Michelin",model:"Agilis",size:"215/65 R16",purchasedOn:"2026-08-01",targetChangeDate:"2028-08-01",targetLifeKm:50000}).success,true);
    assert.equal(createTireSetSchema.safeParse({brand:"X",model:"A",size:"R1",purchasedOn:"2027-01-01",targetChangeDate:"2026-01-01"}).success,false);
    assert.equal(mountTireSetSchema.safeParse({vehicleId,position:"all",mountedOn:"2026-08-01",mountedOdometerKm:120000}).success,true);
    assert.equal(removeTireSetSchema.safeParse({removedOn:"2027-08-01",removedOdometerKm:160000,reason:"Diş derinliği sınırı"}).success,true);
  });
  it("requires defects for unsafe inspections and resolution notes",()=>{
    const assignmentId="10000000-0000-4000-8000-000000000001";
    const critical={item:"Fren",severity:"critical",description:"Pedal basıncı yetersiz"};
    assert.equal(createVehicleInspectionSchema.safeParse({assignmentId,inspectionType:"pre_shift",safeToOperate:false,defects:[critical]}).success,true);
    assert.equal(createVehicleInspectionSchema.safeParse({assignmentId,inspectionType:"pre_shift",safeToOperate:false,defects:[]}).success,false);
    assert.equal(createVehicleInspectionSchema.safeParse({assignmentId,inspectionType:"pre_shift",safeToOperate:true,defects:[critical]}).success,false);
    assert.equal(updateInspectionDefectStatusSchema.safeParse({status:"resolved",resolutionNotes:null}).success,false);
  });
  it("validates safety event coordinates and severity",()=>{
    const base={assignmentId:"10000000-0000-4000-8000-000000000001",eventType:"harsh_braking",severity:"high",occurredAt:new Date().toISOString()};
    assert.equal(createSafetyEventSchema.safeParse({...base,latitude:41.01,longitude:29.01}).success,true);
    assert.equal(createSafetyEventSchema.safeParse({...base,latitude:41.01,longitude:null}).success,false);
    assert.equal(createSafetyEventSchema.safeParse({...base,severity:"extreme"}).success,false);
  });
  it("normalizes email and plate", () => {
    assert.equal(loginSchema.parse({ email: "ADMIN@DEMO.FILO", password: "12345678" }).email,
      "admin@demo.filo");
    assert.equal(createVehicleSchema.parse({
      plate: "34 abc 123", make: "Ford", model: "Transit", year: 2026
    }).plate, "34 ABC 123");
  });

  it("rejects an impossible vehicle year", () => {
    assert.throws(() => createVehicleSchema.parse({
      plate: "34 ABC 123", make: "Ford", model: "Transit", year: 1970
    }));
  });

  it("validates driver, device and assignable roles", () => {
    assert.equal(createDriverSchema.safeParse({ fullName: "Ayşe Yılmaz", phone: "5551112233" }).success, true);
    assert.equal(createDeviceSchema.safeParse({ ownership: "personal", platform: "ios", model: "iPhone", driverId: null }).success, true);
    assert.equal(updateMemberRoleSchema.safeParse({ role: "owner" }).success, false);
  });

  it("validates assignment and safe tracking transitions", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    assert.equal(createAssignmentSchema.safeParse({ vehicleId:id, driverId:id, deviceId:null }).success, true);
    assert.equal(updateTrackingSchema.safeParse({ permission:"denied", state:"tracking" }).success, false);
    assert.equal(updateTrackingSchema.safeParse({ permission:"granted_always", state:"tracking" }).success, true);
  });

  it("rejects invalid coordinates and accuracy", () => {
    const base={assignmentId:"10000000-0000-4000-8000-000000000001",eventId:"30000000-0000-4000-8000-000000000001",recordedAt:new Date().toISOString()};
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:41.01,longitude:29.01,accuracyMeters:12}).success,true);
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:91,longitude:29.01,accuracyMeters:12}).success,false);
    assert.equal(createLocationEventSchema.safeParse({...base,latitude:41.01,longitude:29.01,accuracyMeters:0}).success,false);
  });

  it("keeps route event identifiers tenant-safe and bounded", () => {
    const input={assignmentId:"10000000-0000-4000-8000-000000000001",eventId:"30000000-0000-4000-8000-000000000001",recordedAt:new Date().toISOString(),latitude:41.01,longitude:29.01,accuracyMeters:25,speedMps:12,headingDegrees:359};
    assert.equal(createLocationEventSchema.safeParse(input).success,true);
    assert.equal(createLocationEventSchema.safeParse({...input,headingDegrees:360}).success,false);
  });

  it("bounds geofence centers and radii", () => {
    assert.equal(createGeofenceSchema.safeParse({name:"Merkez Depo",latitude:41.01,longitude:29.01,radiusMeters:250}).success,true);
    assert.equal(createGeofenceSchema.safeParse({name:"X",latitude:41.01,longitude:29.01,radiusMeters:250}).success,false);
    assert.equal(createGeofenceSchema.safeParse({name:"Merkez",latitude:41.01,longitude:29.01,radiusMeters:25}).success,false);
    assert.equal(createGeofenceSchema.safeParse({name:"Merkez",latitude:91,longitude:29.01,radiusMeters:250}).success,false);
  });
  it("requires the correct alert rule target",()=>{
    const geofenceId="10000000-0000-4000-8000-000000000001";
    assert.equal(createAlertRuleSchema.safeParse({name:"Depo girişi",type:"geofence_entered",geofenceId,thresholdKph:null}).success,true);
    assert.equal(createAlertRuleSchema.safeParse({name:"Hız",type:"speeding",geofenceId:null,thresholdKph:120}).success,true);
    assert.equal(createAlertRuleSchema.safeParse({name:"Hız",type:"speeding",geofenceId:null,thresholdKph:null}).success,false);
  });
  it("requires a date or odometer maintenance target",()=>{
    const vehicleId="10000000-0000-4000-8000-000000000001";
    assert.equal(createMaintenancePlanSchema.safeParse({vehicleId,title:"Periyodik bakım",dueDate:"2026-09-01",dueOdometerKm:null}).success,true);
    assert.equal(createMaintenancePlanSchema.safeParse({vehicleId,title:"Yağ değişimi",dueDate:null,dueOdometerKm:120000}).success,true);
    assert.equal(createMaintenancePlanSchema.safeParse({vehicleId,title:"Bakım",dueDate:null,dueOdometerKm:null}).success,false);
  });
  it("validates fuel and non-fuel expense details",()=>{
    const vehicleId="10000000-0000-4000-8000-000000000001";
    assert.equal(createVehicleExpenseSchema.safeParse({vehicleId,category:"fuel",occurredOn:"2026-08-01",amount:2250,odometerKm:120000,liters:45,description:null}).success,true);
    assert.equal(createVehicleExpenseSchema.safeParse({vehicleId,category:"fuel",occurredOn:"2026-08-01",amount:2250,liters:null}).success,false);
    assert.equal(createVehicleExpenseSchema.safeParse({vehicleId,category:"parking",occurredOn:"2026-08-01",amount:250,liters:5}).success,false);
    assert.equal(createVehicleExpenseSchema.safeParse({vehicleId,category:"toll",occurredOn:"2026-08-01",amount:-1,liters:null}).success,false);
  });
  it("validates vehicle document dates and expiry requirements",()=>{
    const vehicleId="10000000-0000-4000-8000-000000000001";
    assert.equal(createVehicleDocumentSchema.safeParse({vehicleId,documentType:"inspection",validFrom:"2026-08-01",expiresOn:"2027-08-01"}).success,true);
    assert.equal(createVehicleDocumentSchema.safeParse({vehicleId,documentType:"traffic_insurance",expiresOn:null}).success,false);
    assert.equal(createVehicleDocumentSchema.safeParse({vehicleId,documentType:"registration",expiresOn:null}).success,true);
    assert.equal(createVehicleDocumentSchema.safeParse({vehicleId,documentType:"casco",validFrom:"2027-01-01",expiresOn:"2026-01-01"}).success,false);
  });
});
