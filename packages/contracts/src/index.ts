import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

export const createVehicleSchema = z.object({
  plate: z.string().trim().min(5).max(16).transform((value) => value.toUpperCase()),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  status: z.enum(["active", "maintenance", "inactive"]).default("active")
});

export const updateVehicleStatusSchema = z.object({
  status: z.enum(["active", "maintenance", "inactive"])
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleStatusInput = z.infer<typeof updateVehicleStatusSchema>;

export type SessionUser = {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  fullName: string;
  role: "owner" | "admin" | "operator" | "viewer";
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const createDriverSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  licenseNumber: z.string().trim().min(3).max(40).optional(),
  status: z.enum(["active", "inactive"]).default("active")
});

export const createDeviceSchema = z.object({
  ownership: z.enum(["company", "personal"]),
  platform: z.enum(["android", "ios"]),
  model: z.string().trim().min(1).max(100),
  identifier: z.string().trim().max(120).optional(),
  driverId: z.string().uuid().nullable().default(null),
  status: z.enum(["active", "inactive"]).default("active")
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"])
});

export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export type Driver = {
  id: string; tenantId: string; fullName: string; phone: string;
  licenseNumber: string | null; status: "active" | "inactive"; createdAt: string;
};

export type Device = {
  id: string; tenantId: string; ownership: "company" | "personal";
  platform: "android" | "ios"; model: string; identifier: string | null;
  driverId: string | null; driverName: string | null;
  status: "active" | "inactive"; createdAt: string;
};

export type Member = {
  userId: string; fullName: string; email: string;
  role: SessionUser["role"]; createdAt: string;
};

export type Vehicle = {
  id: string;
  tenantId: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  status: "active" | "maintenance" | "inactive";
  createdAt: string;
};

export const createAssignmentSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  deviceId: z.string().uuid().nullable().default(null),
  startsAt: z.string().datetime().optional()
});

export const startShiftSchema = z.object({
  assignmentId: z.string().uuid()
});

export const updateTrackingSchema = z.object({
  permission: z.enum(["unknown", "granted_while_in_use", "granted_always", "denied", "restricted"]),
  state: z.enum(["off", "ready", "tracking", "paused", "permission_revoked", "error"]),
  errorCode: z.string().trim().max(80).nullable().optional()
}).superRefine((value, context) => {
  const permitted = value.permission === "granted_while_in_use" || value.permission === "granted_always";
  if (value.state === "tracking" && !permitted) {
    context.addIssue({ code: "custom", message: "Tracking requires location permission", path: ["state"] });
  }
});

export type Assignment = {
  id: string; tenantId: string; vehicleId: string; vehiclePlate: string;
  driverId: string; driverName: string; deviceId: string | null; deviceModel: string | null;
  startsAt: string; endedAt: string | null; createdAt: string;
};

export type WorkShift = {
  id: string; assignmentId: string; vehiclePlate: string; driverName: string;
  startedAt: string; endedAt: string | null; status: "active" | "completed";
};

export type TrackingStatus = {
  assignmentId: string; permission: "unknown" | "granted_while_in_use" | "granted_always" | "denied" | "restricted";
  state: "off" | "ready" | "tracking" | "paused" | "permission_revoked" | "error";
  errorCode: string | null; updatedAt: string;
};

export const createLocationEventSchema = z.object({
  assignmentId: z.string().uuid(),
  eventId: z.string().uuid(),
  recordedAt: z.string().datetime(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().positive().max(5000),
  speedMps: z.number().finite().min(0).max(150).nullable().optional(),
  headingDegrees: z.number().finite().min(0).lt(360).nullable().optional()
});

export type CreateLocationEventInput = z.infer<typeof createLocationEventSchema>;

export type LatestLocation = {
  assignmentId: string; vehiclePlate: string; driverName: string;
  latitude: number; longitude: number; accuracyMeters: number;
  recordedAt: string; receivedAt: string;
};

export type RoutePoint = {
  id: string; latitude: number; longitude: number; accuracyMeters: number;
  speedMps: number | null; headingDegrees: number | null; recordedAt: string;
};

export type ShiftRoute = {
  shiftId: string; assignmentId: string; vehiclePlate: string; driverName: string;
  startedAt: string; endedAt: string | null; pointCount: number;
  distanceMeters: number; movingSeconds: number; stoppedSeconds: number;
  points: RoutePoint[];
};

export const createGeofenceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(50000)
});

export type CreateGeofenceInput = z.infer<typeof createGeofenceSchema>;
export type Geofence = CreateGeofenceInput & {
  id: string; status: "active" | "inactive"; createdAt: string;
};
export type GeofenceEvent = {
  id: string; geofenceId: string; geofenceName: string; assignmentId: string;
  vehiclePlate: string; driverName: string; eventType: "entered" | "exited";
  occurredAt: string;
};

export const createAlertRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["geofence_entered", "geofence_exited", "speeding"]),
  geofenceId: z.string().uuid().nullable().default(null),
  thresholdKph: z.number().int().min(20).max(250).nullable().default(null)
}).superRefine((value, context) => {
  if (value.type === "speeding" && value.thresholdKph === null)
    context.addIssue({code:"custom",message:"Speeding rule requires a threshold",path:["thresholdKph"]});
  if (value.type !== "speeding" && value.geofenceId === null)
    context.addIssue({code:"custom",message:"Geofence rule requires a geofence",path:["geofenceId"]});
});
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
export type AlertRule = CreateAlertRuleInput & { id:string; status:"active"|"inactive"; createdAt:string };
export type OperationalAlert = {
  id:string; ruleId:string; ruleName:string; type:CreateAlertRuleInput["type"];
  assignmentId:string; vehiclePlate:string; driverName:string; occurredAt:string;
  status:"open"|"acknowledged"|"resolved"; metadata:Record<string,unknown>;
  acknowledgedAt:string|null; resolvedAt:string|null;
};

export const createMaintenancePlanSchema=z.object({
  vehicleId:z.string().uuid(),title:z.string().trim().min(2).max(120),
  dueDate:z.string().date().nullable().default(null),dueOdometerKm:z.number().int().positive().max(10_000_000).nullable().default(null),
  notes:z.string().trim().max(1000).nullable().default(null)
}).superRefine((value,context)=>{if(value.dueDate===null&&value.dueOdometerKm===null)context.addIssue({code:"custom",message:"Date or odometer target is required"});});
export const completeMaintenanceSchema=z.object({completedOdometerKm:z.number().int().min(0).max(10_000_000).nullable().default(null)});
export type CreateMaintenancePlanInput=z.infer<typeof createMaintenancePlanSchema>;
export type MaintenancePlan={id:string;vehicleId:string;vehiclePlate:string;title:string;dueDate:string|null;dueOdometerKm:number|null;status:"scheduled"|"completed"|"cancelled";displayStatus:"scheduled"|"due_soon"|"overdue"|"completed"|"cancelled";notes:string|null;completedAt:string|null;completedOdometerKm:number|null;createdAt:string};

export const createVehicleExpenseSchema=z.object({
  vehicleId:z.string().uuid(),category:z.enum(["fuel","toll","parking","wash","repair","other"]),
  occurredOn:z.string().date(),amount:z.number().finite().positive().max(10_000_000),
  odometerKm:z.number().int().min(0).max(10_000_000).nullable().default(null),
  liters:z.number().finite().positive().max(5000).nullable().default(null),
  description:z.string().trim().max(500).nullable().default(null)
}).superRefine((value,context)=>{
  if(value.category==="fuel"&&value.liters===null)context.addIssue({code:"custom",message:"Fuel expense requires liters",path:["liters"]});
  if(value.category!=="fuel"&&value.liters!==null)context.addIssue({code:"custom",message:"Liters are only valid for fuel",path:["liters"]});
});
export type CreateVehicleExpenseInput=z.infer<typeof createVehicleExpenseSchema>;
export type VehicleExpense={id:string;vehicleId:string;vehiclePlate:string;category:CreateVehicleExpenseInput["category"];occurredOn:string;amount:number;odometerKm:number|null;liters:number|null;description:string|null;createdAt:string};
export type ExpenseSummary={totalAmount:number;fuelAmount:number;fuelLiters:number;entryCount:number;byVehicle:Array<{vehicleId:string;vehiclePlate:string;totalAmount:number;fuelLiters:number;entryCount:number}>};

export const createVehicleDocumentSchema=z.object({
  vehicleId:z.string().uuid(),documentType:z.enum(["traffic_insurance","casco","inspection","registration","other"]),
  documentNumber:z.string().trim().min(2).max(120).nullable().default(null),validFrom:z.string().date().nullable().default(null),
  expiresOn:z.string().date().nullable().default(null),notes:z.string().trim().max(1000).nullable().default(null)
}).superRefine((value,context)=>{
  if(value.documentType!=="registration"&&value.expiresOn===null)context.addIssue({code:"custom",message:"Expiry date is required",path:["expiresOn"]});
  if(value.validFrom&&value.expiresOn&&value.expiresOn<value.validFrom)context.addIssue({code:"custom",message:"Expiry must follow validity start",path:["expiresOn"]});
});
export const updateVehicleDocumentStatusSchema=z.object({status:z.enum(["renewed","cancelled"])});
export type CreateVehicleDocumentInput=z.infer<typeof createVehicleDocumentSchema>;
export type VehicleDocument={id:string;vehicleId:string;vehiclePlate:string;documentType:CreateVehicleDocumentInput["documentType"];documentNumber:string|null;validFrom:string|null;expiresOn:string|null;notes:string|null;status:"active"|"renewed"|"cancelled";displayStatus:"valid"|"expiring_soon"|"expired"|"renewed"|"cancelled";daysUntilExpiry:number|null;renewedByDocumentId:string|null;createdAt:string};

export const createSafetyEventSchema=z.object({
  assignmentId:z.string().uuid(),eventType:z.enum(["speeding","harsh_braking","harsh_acceleration","long_idle","manual"]),
  severity:z.enum(["low","medium","high","critical"]),occurredAt:z.string().datetime(),
  latitude:z.number().finite().min(-90).max(90).nullable().default(null),longitude:z.number().finite().min(-180).max(180).nullable().default(null),
  value:z.number().finite().min(0).max(100000).nullable().default(null),notes:z.string().trim().max(1000).nullable().default(null)
}).superRefine((value,context)=>{if((value.latitude===null)!==(value.longitude===null))context.addIssue({code:"custom",message:"Coordinates must be supplied together",path:["latitude"]});});
export const updateSafetyEventStatusSchema=z.object({status:z.enum(["reviewed","resolved"])});
export type CreateSafetyEventInput=z.infer<typeof createSafetyEventSchema>;
export type SafetyEvent={id:string;assignmentId:string;vehicleId:string;vehiclePlate:string;driverId:string;driverName:string;eventType:CreateSafetyEventInput["eventType"];severity:CreateSafetyEventInput["severity"];occurredAt:string;latitude:number|null;longitude:number|null;value:number|null;notes:string|null;status:"open"|"reviewed"|"resolved";reviewedAt:string|null;resolvedAt:string|null;createdAt:string};
export type SafetySummary={total:number;open:number;serious:number;assignmentCount:number};

export const createVehicleInspectionSchema=z.object({
  assignmentId:z.string().uuid(),inspectionType:z.enum(["pre_shift","post_shift"]),
  odometerKm:z.number().int().min(0).max(10_000_000).nullable().default(null),
  safeToOperate:z.boolean(),notes:z.string().trim().max(1000).nullable().default(null),
  defects:z.array(z.object({item:z.string().trim().min(2).max(120),severity:z.enum(["minor","major","critical"]),description:z.string().trim().min(2).max(500)})).max(50).default([])
}).superRefine((value,context)=>{
  if(value.safeToOperate&&value.defects.some(defect=>defect.severity==="critical"))context.addIssue({code:"custom",message:"Critical defects make the vehicle unsafe",path:["safeToOperate"]});
  if(!value.safeToOperate&&value.defects.length===0)context.addIssue({code:"custom",message:"Unsafe inspection requires a defect",path:["defects"]});
});
export const updateInspectionDefectStatusSchema=z.object({status:z.enum(["reviewed","resolved"]),resolutionNotes:z.string().trim().min(2).max(1000).nullable().default(null)}).superRefine((value,context)=>{if(value.status==="resolved"&&value.resolutionNotes===null)context.addIssue({code:"custom",message:"Resolution notes are required",path:["resolutionNotes"]});});
export type CreateVehicleInspectionInput=z.infer<typeof createVehicleInspectionSchema>;
export type InspectionDefect={id:string;item:string;severity:"minor"|"major"|"critical";description:string;status:"open"|"reviewed"|"resolved";resolutionNotes:string|null;reviewedAt:string|null;resolvedAt:string|null};
export type VehicleInspection={id:string;assignmentId:string;vehicleId:string;vehiclePlate:string;driverId:string;driverName:string;inspectionType:"pre_shift"|"post_shift";odometerKm:number|null;safeToOperate:boolean;notes:string|null;inspectedAt:string;defects:InspectionDefect[]};
export type InspectionSummary={total:number;unsafe:number;openDefects:number;criticalDefects:number};

export const createTireSetSchema=z.object({
  brand:z.string().trim().min(2).max(80),model:z.string().trim().min(1).max(80),size:z.string().trim().min(3).max(40),
  serialNumber:z.string().trim().min(2).max(120).nullable().default(null),purchasedOn:z.string().date().nullable().default(null),
  initialOdometerKm:z.number().int().min(0).max(10_000_000).nullable().default(null),targetLifeKm:z.number().int().min(1000).max(500_000).nullable().default(null),
  targetChangeDate:z.string().date().nullable().default(null),notes:z.string().trim().max(1000).nullable().default(null)
}).superRefine((value,context)=>{if(value.purchasedOn&&value.targetChangeDate&&value.targetChangeDate<value.purchasedOn)context.addIssue({code:"custom",message:"Target change date must follow purchase date",path:["targetChangeDate"]});});
export const mountTireSetSchema=z.object({vehicleId:z.string().uuid(),position:z.enum(["front","rear","all"]),mountedOn:z.string().date(),mountedOdometerKm:z.number().int().min(0).max(10_000_000)});
export const removeTireSetSchema=z.object({removedOn:z.string().date(),removedOdometerKm:z.number().int().min(0).max(10_000_000),reason:z.string().trim().min(2).max(500)});
export type CreateTireSetInput=z.infer<typeof createTireSetSchema>;
export type TireSet={id:string;brand:string;model:string;size:string;serialNumber:string|null;purchasedOn:string|null;initialOdometerKm:number|null;targetLifeKm:number|null;targetChangeDate:string|null;notes:string|null;status:"stored"|"mounted"|"retired";vehicleId:string|null;vehiclePlate:string|null;position:"front"|"rear"|"all"|null;mountedOn:string|null;mountedOdometerKm:number|null;currentOdometerKm:number|null;usedKm:number|null;remainingKm:number|null;displayStatus:"stored"|"mounted"|"due_soon"|"overdue"|"retired";createdAt:string};
export type TireSummary={total:number;mounted:number;dueSoon:number;overdue:number};

export const createVehicleIncidentSchema=z.object({
  vehicleId:z.string().uuid(),driverId:z.string().uuid().nullable().default(null),
  incidentType:z.enum(["accident","damage","theft","breakdown","other"]),severity:z.enum(["minor","major","critical"]),
  occurredAt:z.string().datetime(),location:z.string().trim().max(240).nullable().default(null),
  description:z.string().trim().min(5).max(2000),injuryReported:z.boolean().default(false),policeReportNumber:z.string().trim().max(120).nullable().default(null),
  insuranceClaimNumber:z.string().trim().max(120).nullable().default(null),estimatedCost:z.number().finite().min(0).max(100_000_000).nullable().default(null)
}).superRefine((value,context)=>{if(value.injuryReported&&value.incidentType!=="accident")context.addIssue({code:"custom",message:"Injury can only be reported for an accident",path:["injuryReported"]});});
export const updateVehicleIncidentSchema=z.object({status:z.enum(["reviewing","resolved","closed"]),resolutionNotes:z.string().trim().min(3).max(2000).nullable().default(null),insuranceClaimNumber:z.string().trim().max(120).nullable().default(null),actualCost:z.number().finite().min(0).max(100_000_000).nullable().default(null)}).superRefine((value,context)=>{if((value.status==="resolved"||value.status==="closed")&&value.resolutionNotes===null)context.addIssue({code:"custom",message:"Resolution notes are required",path:["resolutionNotes"]});});
export type CreateVehicleIncidentInput=z.infer<typeof createVehicleIncidentSchema>;
export type VehicleIncident={id:string;vehicleId:string;vehiclePlate:string;driverId:string|null;driverName:string|null;incidentType:CreateVehicleIncidentInput["incidentType"];severity:CreateVehicleIncidentInput["severity"];occurredAt:string;location:string|null;description:string;injuryReported:boolean;policeReportNumber:string|null;insuranceClaimNumber:string|null;estimatedCost:number|null;actualCost:number|null;status:"open"|"reviewing"|"resolved"|"closed";resolutionNotes:string|null;resolvedAt:string|null;createdAt:string};
export type IncidentSummary={total:number;open:number;critical:number;estimatedExposure:number};

export const reportQuerySchema=z.object({from:z.string().date(),to:z.string().date(),vehicleId:z.string().uuid().nullable().optional().default(null)}).superRefine((value,context)=>{if(value.to<value.from)context.addIssue({code:"custom",message:"Report end must follow start",path:["to"]});const days=(new Date(value.to).getTime()-new Date(value.from).getTime())/86400000;if(days>366)context.addIssue({code:"custom",message:"Report range cannot exceed 366 days",path:["to"]});});
export type ReportQuery=z.infer<typeof reportQuerySchema>;
export type FleetReportRow={vehicleId:string;vehiclePlate:string;distanceKm:number;totalExpense:number;fuelLiters:number;safetyEvents:number;incidents:number;overdueMaintenance:number;expiredDocuments:number;openDefects:number};
export type FleetReport={range:ReportQuery;summary:{vehicleCount:number;distanceKm:number;totalExpense:number;fuelLiters:number;safetyEvents:number;incidents:number;overdueMaintenance:number;expiredDocuments:number;openDefects:number};vehicles:FleetReportRow[]};
export const actionQuerySchema=z.object({status:z.enum(["open","in_progress","completed","cancelled"]).optional()});
export const createActionItemSchema=z.object({title:z.string().trim().min(2).max(180),description:z.string().trim().max(2000).nullable().default(null),priority:z.enum(["low","medium","high","critical"]),vehicleId:z.string().uuid().nullable().default(null),assignedUserId:z.string().uuid().nullable().default(null),dueOn:z.string().date().nullable().default(null)});
export const updateActionItemSchema=z.object({status:z.enum(["open","in_progress","completed","cancelled"]),assignedUserId:z.string().uuid().nullable().default(null),dueOn:z.string().date().nullable().default(null)});
export type CreateActionItemInput=z.infer<typeof createActionItemSchema>;
export type ActionItem={id:string;sourceType:"maintenance"|"document"|"defect"|"safety_event"|"incident"|"manual";sourceId:string|null;title:string;description:string|null;priority:"low"|"medium"|"high"|"critical";status:"open"|"in_progress"|"completed"|"cancelled";vehicleId:string|null;vehiclePlate:string|null;assignedUserId:string|null;assignedUserName:string|null;dueOn:string|null;completedAt:string|null;createdAt:string};

export const createNotificationProviderSchema=z.object({name:z.string().trim().min(2).max(120),channel:z.enum(["email","push"]),provider:z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),credentialEnvRef:z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,79}$/),webhookSecretEnvRef:z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,79}$/).nullable().default(null),status:z.enum(["active","inactive"]).default("inactive")});
export const updateNotificationProviderSchema=z.object({status:z.enum(["active","inactive"])});
export const providerWebhookSchema=z.object({eventId:z.string().trim().min(1).max(200),deliveryId:z.string().uuid(),event:z.enum(["delivered","bounced","complained"]),providerMessageId:z.string().trim().max(300).nullable().default(null),occurredAt:z.string().datetime(),metadata:z.record(z.string(),z.unknown()).default({})});
export type CreateNotificationProviderInput=z.infer<typeof createNotificationProviderSchema>;
export const createNotificationSuppressionSchema=z.object({recipientUserId:z.string().uuid(),channel:z.enum(["email","push"]),details:z.string().trim().max(500).nullable().default(null)});
export type CreateNotificationSuppressionInput=z.infer<typeof createNotificationSuppressionSchema>;
export type NotificationSuppression={id:string;recipientUserId:string;recipientName:string;email:string;channel:"email"|"push";reason:"hard_bounce"|"complaint"|"manual";details:string|null;active:boolean;createdAt:string;liftedAt:string|null};
export const notificationAnalyticsQuerySchema=z.object({days:z.coerce.number().int().min(1).max(90).default(30)});
export type NotificationAnalytics={rangeDays:number;summary:{total:number;delivered:number;failed:number;cancelled:number;queued:number;averageDeliverySeconds:number;oldestReadyAgeSeconds:number};events:{bounced:number;complained:number};suppressions:{active:number;hardBounce:number;complaints:number;manual:number};breakdown:Array<{channel:"email"|"push";provider:string;status:NotificationDelivery["status"];count:number}>};

export const notificationQuerySchema=z.object({status:z.enum(["unread","read","all"]).default("unread"),severity:z.enum(["info","warning","critical"]).optional()});
export const createNotificationRuleSchema=z.object({name:z.string().trim().min(2).max(120),sourceType:z.enum(["maintenance","document","action","safety_event","incident"]),leadDays:z.number().int().min(0).max(365).default(0),severity:z.enum(["info","warning","critical"]),targetRole:z.enum(["owner","admin","operator","viewer"]).nullable().default(null)});
export const updateNotificationRuleSchema=z.object({status:z.enum(["active","inactive"])});
export type CreateNotificationRuleInput=z.infer<typeof createNotificationRuleSchema>;
export type NotificationRule={id:string;name:string;sourceType:CreateNotificationRuleInput["sourceType"];leadDays:number;severity:CreateNotificationRuleInput["severity"];targetRole:CreateNotificationRuleInput["targetRole"];status:"active"|"inactive";createdAt:string};
export type NotificationItem={id:string;ruleId:string|null;sourceType:CreateNotificationRuleInput["sourceType"];sourceId:string;title:string;message:string;severity:"info"|"warning"|"critical";vehicleId:string|null;vehiclePlate:string|null;recipientUserId:string;readAt:string|null;createdAt:string};

export const updateNotificationPreferencesSchema=z.object({emailEnabled:z.boolean(),pushEnabled:z.boolean(),quietHoursEnabled:z.boolean(),quietStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),quietEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),timezone:z.string().trim().min(1).max(64)}).superRefine((value,context)=>{if(value.quietHoursEnabled&&(!value.quietStart||!value.quietEnd))context.addIssue({code:"custom",message:"Quiet hours require start and end times",path:["quietStart"]});});
export const deliveryQuerySchema=z.object({status:z.enum(["pending","processing","delivered","failed","cancelled","all"]).default("all")});
export const updateDeliveryStatusSchema=z.object({status:z.enum(["delivered","failed"]),error:z.string().trim().min(2).max(1000).nullable().default(null)}).superRefine((value,context)=>{if(value.status==="failed"&&!value.error)context.addIssue({code:"custom",message:"Failed delivery requires an error",path:["error"]});});
export type NotificationPreferences={emailEnabled:boolean;pushEnabled:boolean;quietHoursEnabled:boolean;quietStart:string|null;quietEnd:string|null;timezone:string;updatedAt:string|null};
export type NotificationDelivery={id:string;notificationId:string;title:string;recipientUserId:string;recipientName:string;channel:"email"|"push";status:"pending"|"processing"|"delivered"|"failed"|"cancelled";attemptCount:number;availableAt:string;deliveredAt:string|null;lastError:string|null;createdAt:string};

export const claimDeliveriesSchema=z.object({tenantId:z.string().uuid(),actorUserId:z.string().uuid(),workerId:z.string().trim().min(3).max(120),limit:z.number().int().min(1).max(100).default(25)});
export const completeDeliverySchema=z.object({tenantId:z.string().uuid(),actorUserId:z.string().uuid(),leaseToken:z.string().uuid(),outcome:z.enum(["delivered","failed"]),providerMessageId:z.string().trim().max(240).nullable().default(null),error:z.string().trim().min(2).max(1000).nullable().default(null)}).superRefine((value,context)=>{if(value.outcome==="failed"&&!value.error)context.addIssue({code:"custom",message:"Failed delivery requires an error",path:["error"]});});
export type ClaimedDelivery={id:string;leaseToken:string;notificationId:string;recipientUserId:string;recipientEmail:string;channel:"email"|"push";locale:string;title:string;message:string;attemptCount:number;leaseExpiresAt:string};
export type DeliveryMetrics={pending:number;processing:number;delivered:number;failed:number;cancelled:number;ready:number;oldestReadyAt:string|null};

export const createNotificationTemplateSchema=z.object({key:z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,79}$/),channel:z.enum(["email","push"]),locale:z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),subjectTemplate:z.string().trim().min(1).max(240),bodyTemplate:z.string().trim().min(1).max(5000),requiredVariables:z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)).max(30).default([])});
export const previewNotificationTemplateSchema=z.object({subjectTemplate:z.string().max(240),bodyTemplate:z.string().max(5000),variables:z.record(z.string(),z.string().max(1000))});
export const updateNotificationTemplateSchema=z.object({status:z.enum(["active","inactive"])});
export type CreateNotificationTemplateInput=z.infer<typeof createNotificationTemplateSchema>;
export type NotificationTemplate=CreateNotificationTemplateInput&{id:string;status:"active"|"inactive";createdAt:string};
