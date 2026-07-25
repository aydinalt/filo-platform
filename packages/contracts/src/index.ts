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
