import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignNotificationArchiveReconciliationSchema, claimDeliveriesSchema, completeDeliverySchema, createNotificationProviderSchema, createNotificationSuppressionSchema, deliveryCompletionParamsSchema, deliveryOperatorActionSchema, deliveryQuerySchema, manualNotificationArchiveReconciliationReminderSchema, manualReconcileNotificationArchiveSchema, notificationActionTargetSchema, notificationAnalyticsQuerySchema, notificationArchiveReconciliationParamsSchema, notificationProviderHealthQuerySchema, notificationProviderIncidentQuerySchema, notificationProviderParamsSchema, providerWebhookParamsSchema, providerWebhookSchema, reconcileNotificationArchiveAttemptsSchema, renewDeliveryLeaseSchema, retryNotificationArchiveSchema, runNotificationArchiveReconciliationReminderSchema, runNotificationArchiveSchema, runNotificationProviderIncidentScanSchema, updateNotificationArchiveReconciliationSchema, updateNotificationPreferencesSchema, updateNotificationProviderHealthSettingsSchema, updateNotificationProviderIncidentScanSettingsSchema, updateNotificationProviderIncidentSchema, updateNotificationRetentionSchema } from "@filo/contracts";
import { actionQuerySchema, createActionItemSchema, updateActionItemSchema, createNotificationRuleSchema, notificationQuerySchema, createAlertRuleSchema, createAssignmentSchema, createDeviceSchema, createDriverSchema, createGeofenceSchema, createLocationEventSchema, createMaintenancePlanSchema, createSafetyEventSchema, createTireSetSchema, createVehicleDocumentSchema, createVehicleExpenseSchema, createVehicleIncidentSchema, createVehicleInspectionSchema, createVehicleSchema, loginSchema, mountTireSetSchema, removeTireSetSchema, reportQuerySchema, updateInspectionDefectStatusSchema, updateMemberRoleSchema, updateTrackingSchema, updateVehicleIncidentSchema } from "@filo/contracts";

describe("API contracts", () => {
  it("bounds automated notification retention settings",()=>{const settings={readRetentionDays:90,automaticArchiveEnabled:true,archiveIntervalHours:24,archiveBatchSize:500,automaticReconciliationEnabled:false,reconciliationIntervalMinutes:15,reconciliationStaleAfterMinutes:15};assert.equal(updateNotificationRetentionSchema.safeParse(settings).success,true);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,readRetentionDays:7}).success,false);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,archiveBatchSize:5001}).success,false);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,reconciliationIntervalMinutes:4}).success,false);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,reconciliationStaleAfterMinutes:1441}).success,false);assert.equal(notificationQuerySchema.safeParse({status:"archived"}).success,true);});
  it("requires tenant-safe idempotent archive scheduler requests",()=>{assert.equal(runNotificationArchiveSchema.safeParse({tenantId:"10000000-0000-4000-8000-000000000001",actorUserId:"20000000-0000-4000-8000-000000000001",runKey:"scheduler:2026-08-04T16:00"}).success,true);assert.equal(runNotificationArchiveSchema.safeParse({tenantId:"bad",actorUserId:"bad",runKey:"short"}).success,false);});
  it("accepts only UUID archive attempts for controlled retries",()=>{assert.equal(retryNotificationArchiveSchema.safeParse({attemptId:"10000000-0000-4000-8000-000000000001"}).success,true);assert.equal(retryNotificationArchiveSchema.safeParse({attemptId:"latest-failed"}).success,false);});
  it("requires tenant-safe idempotent reconciliation scheduler requests",()=>{const input={tenantId:"10000000-0000-4000-8000-000000000001",actorUserId:"20000000-0000-4000-8000-000000000001",reconciliationKey:"reconcile:2026-08-04T16:30"};assert.equal(reconcileNotificationArchiveAttemptsSchema.safeParse(input).success,true);assert.equal(reconcileNotificationArchiveAttemptsSchema.safeParse({...input,reconciliationKey:"short"}).success,false);assert.equal(reconcileNotificationArchiveAttemptsSchema.safeParse({...input,tenantId:"bad"}).success,false);});
  it("requires explicit confirmation for manual archive reconciliation",()=>{assert.equal(manualReconcileNotificationArchiveSchema.safeParse({confirmation:"RECONCILE_STALE_ATTEMPTS"}).success,true);assert.equal(manualReconcileNotificationArchiveSchema.safeParse({confirmation:"yes"}).success,false);assert.equal(manualReconcileNotificationArchiveSchema.safeParse({}).success,false);});
  it("validates controlled archive reconciliation handling",()=>{assert.equal(notificationArchiveReconciliationParamsSchema.safeParse({reconciliationId:"10000000-0000-4000-8000-000000000001"}).success,true);assert.equal(notificationArchiveReconciliationParamsSchema.safeParse({reconciliationId:"latest"}).success,false);assert.equal(updateNotificationArchiveReconciliationSchema.safeParse({status:"acknowledged",resolutionNotes:null}).success,true);assert.equal(updateNotificationArchiveReconciliationSchema.safeParse({status:"resolved",resolutionNotes:null}).success,false);assert.equal(updateNotificationArchiveReconciliationSchema.safeParse({status:"resolved",resolutionNotes:"Kontrollü yeniden deneme tamamlandı"}).success,true);});
  it("validates reconciliation assignment and overdue reminder scans",()=>{const userId="10000000-0000-4000-8000-000000000001";const tenantId="20000000-0000-4000-8000-000000000001";assert.equal(assignNotificationArchiveReconciliationSchema.safeParse({assignedUserId:userId}).success,true);assert.equal(assignNotificationArchiveReconciliationSchema.safeParse({assignedUserId:null}).success,true);assert.equal(assignNotificationArchiveReconciliationSchema.safeParse({assignedUserId:"operator"}).success,false);assert.equal(runNotificationArchiveReconciliationReminderSchema.safeParse({tenantId,actorUserId:userId,runKey:"reminders:2026-08-05T18:00"}).success,true);assert.equal(runNotificationArchiveReconciliationReminderSchema.safeParse({tenantId:"bad",actorUserId:userId,runKey:"short"}).success,false);assert.equal(manualNotificationArchiveReconciliationReminderSchema.safeParse({confirmation:"NOTIFY_OVERDUE_RECONCILIATIONS"}).success,true);assert.equal(manualNotificationArchiveReconciliationReminderSchema.safeParse({confirmation:"yes"}).success,false);});
  it("bounds scheduled archive reconciliation settings",()=>{const settings={readRetentionDays:90,automaticArchiveEnabled:false,archiveIntervalHours:24,archiveBatchSize:500,automaticReconciliationEnabled:true,reconciliationIntervalMinutes:30,reconciliationStaleAfterMinutes:15};assert.equal(updateNotificationRetentionSchema.safeParse(settings).success,true);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,reconciliationIntervalMinutes:4}).success,false);assert.equal(updateNotificationRetentionSchema.safeParse({...settings,reconciliationStaleAfterMinutes:1441}).success,false);});
  it("allows only tenant-safe provider incident notification targets",()=>{assert.equal(notificationActionTargetSchema.safeParse({type:"provider_incident",id:"10000000-0000-4000-8000-000000000001"}).success,true);assert.equal(notificationActionTargetSchema.safeParse({type:"external_url",id:"https://example.com"}).success,false);});
  it("validates scheduled incident scans and recovery settings",()=>{const ids={tenantId:"10000000-0000-4000-8000-000000000001",actorUserId:"20000000-0000-4000-8000-000000000001",scanKey:"scheduler:2026-08-04T10:15"};assert.equal(runNotificationProviderIncidentScanSchema.safeParse(ids).success,true);assert.equal(runNotificationProviderIncidentScanSchema.safeParse({...ids,scanKey:"short"}).success,false);assert.equal(updateNotificationProviderIncidentScanSettingsSchema.safeParse({enabled:true,intervalMinutes:5,recoveryConfirmationScans:2}).success,true);assert.equal(updateNotificationProviderIncidentScanSettingsSchema.safeParse({enabled:true,intervalMinutes:0,recoveryConfirmationScans:20}).success,false);});
  it("validates notification provider incident lifecycle",()=>{assert.equal(notificationProviderIncidentQuerySchema.safeParse({status:"open"}).success,true);assert.equal(notificationProviderIncidentQuerySchema.safeParse({status:"closed"}).success,false);assert.equal(updateNotificationProviderIncidentSchema.safeParse({status:"acknowledged",resolutionNotes:null}).success,true);assert.equal(updateNotificationProviderIncidentSchema.safeParse({status:"resolved",resolutionNotes:null}).success,false);assert.equal(updateNotificationProviderIncidentSchema.safeParse({status:"resolved",resolutionNotes:"Provider configuration repaired"}).success,true);});
  it("bounds notification provider health settings",()=>{assert.equal(notificationProviderHealthQuerySchema.safeParse({lookbackHours:"24"}).success,true);assert.equal(notificationProviderHealthQuerySchema.safeParse({lookbackHours:169}).success,false);assert.equal(updateNotificationProviderHealthSettingsSchema.safeParse({failureRateWarningPercent:10,queueAgeWarningSeconds:900,lookbackHours:24}).success,true);assert.equal(updateNotificationProviderHealthSettingsSchema.safeParse({failureRateWarningPercent:0,queueAgeWarningSeconds:10,lookbackHours:200}).success,false);});
  it("bounds notification analytics windows",()=>{assert.equal(notificationAnalyticsQuerySchema.safeParse({days:"30"}).success,true);assert.equal(notificationAnalyticsQuerySchema.safeParse({days:0}).success,false);assert.equal(notificationAnalyticsQuerySchema.safeParse({days:91}).success,false);});
  it("validates manual notification suppressions",()=>{assert.equal(createNotificationSuppressionSchema.safeParse({recipientUserId:"10000000-0000-4000-8000-000000000001",channel:"email",details:"requested by owner"}).success,true);assert.equal(createNotificationSuppressionSchema.safeParse({recipientUserId:"bad",channel:"sms"}).success,false);});
  it("validates provider references and delivery webhook events",()=>{
    const provider={name:"Primary email",channel:"email",provider:"resend",credentialEnvRef:"FILO_EMAIL_PROVIDER_KEY",webhookSecretEnvRef:"FILO_EMAIL_WEBHOOK_SECRET",status:"active"};
    assert.equal(createNotificationProviderSchema.safeParse(provider).success,true);
    assert.equal(createNotificationProviderSchema.safeParse({...provider,credentialEnvRef:"actual-secret-value"}).success,false);
    assert.equal(notificationProviderParamsSchema.safeParse({id:"10000000-0000-4000-8000-000000000001"}).success,true);
    assert.equal(notificationProviderParamsSchema.safeParse({id:"primary-email"}).success,false);
    const callbackRoute={tenantId:"10000000-0000-4000-8000-000000000001",provider:"resend"};
    assert.equal(providerWebhookParamsSchema.safeParse(callbackRoute).success,true);
    assert.equal(providerWebhookParamsSchema.safeParse({...callbackRoute,tenantId:"not-a-tenant"}).success,false);
    assert.equal(providerWebhookParamsSchema.safeParse({...callbackRoute,provider:"Resend.com"}).success,false);
    const callback={eventId:"evt-1",deliveryId:"10000000-0000-4000-8000-000000000001",event:"bounced",occurredAt:new Date().toISOString(),metadata:{reason:"mailbox_full"}};
    assert.equal(providerWebhookSchema.safeParse(callback).success,true);
    assert.equal(providerWebhookSchema.safeParse({...callback,event:"opened"}).success,false);
  });
  it("validates delivery preferences, filters and terminal updates",()=>{
    const base={emailEnabled:true,pushEnabled:false,quietHoursEnabled:true,quietStart:"22:00",quietEnd:"07:00",timezone:"Europe/Istanbul"};
    assert.equal(updateNotificationPreferencesSchema.safeParse(base).success,true);
    assert.equal(updateNotificationPreferencesSchema.safeParse({...base,quietStart:null}).success,false);
    assert.equal(updateNotificationPreferencesSchema.safeParse({...base,quietEnd:"22:00"}).success,false);
    assert.equal(deliveryQuerySchema.safeParse({status:"failed"}).success,true);
    assert.equal(deliveryQuerySchema.safeParse({status:"unknown"}).success,false);
    assert.equal(deliveryOperatorActionSchema.safeParse({action:"delivered",reason:"MANUAL",confirmation:"APPLY_DELIVERY_ACTION"}).success,false);
    assert.equal(deliveryOperatorActionSchema.safeParse({action:"retry",reason:"provider timeout",confirmation:"APPLY_DELIVERY_ACTION"}).success,false);
    assert.equal(deliveryOperatorActionSchema.safeParse({action:"retry",reason:"PROVIDER_TIMEOUT",confirmation:"APPLY_DELIVERY_ACTION"}).success,true);
    assert.equal(deliveryOperatorActionSchema.safeParse({action:"cancel",reason:"OPERATOR_CANCELLED",confirmation:"APPLY_DELIVERY_ACTION"}).success,true);
    assert.equal(deliveryCompletionParamsSchema.safeParse({id:"10000000-0000-4000-8000-000000000001"}).success,true);
    assert.equal(deliveryCompletionParamsSchema.safeParse({id:"latest"}).success,false);
  });
  it("validates provider dispatch completion outcomes",()=>{
    const worker={tenantId:"10000000-0000-4000-8000-000000000001",actorUserId:"20000000-0000-4000-8000-000000000002",workerId:"worker-primary",leaseToken:"30000000-0000-4000-8000-000000000003"};
    assert.equal(claimDeliveriesSchema.safeParse({...worker,limit:25}).success,true);
    assert.equal(claimDeliveriesSchema.safeParse({...worker,workerId:"unsafe worker",limit:25}).success,false);
    assert.equal(renewDeliveryLeaseSchema.safeParse(worker).success,true);
    assert.equal(renewDeliveryLeaseSchema.safeParse({...worker,leaseToken:"expired"}).success,false);
    assert.equal(completeDeliverySchema.safeParse({...worker,outcome:"delivered",providerMessageId:"provider-message-1",error:null}).success,true);
    assert.equal(completeDeliverySchema.safeParse({...worker,outcome:"delivered",providerMessageId:null,error:null}).success,false);
    assert.equal(completeDeliverySchema.safeParse({...worker,outcome:"failed",providerMessageId:null,error:"PROVIDER_TIMEOUT"}).success,true);
    assert.equal(completeDeliverySchema.safeParse({...worker,outcome:"failed",providerMessageId:"ambiguous",error:"Provider timeout: secret=value"}).success,false);
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
