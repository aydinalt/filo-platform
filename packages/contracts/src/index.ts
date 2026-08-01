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
