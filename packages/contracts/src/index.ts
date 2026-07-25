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
  action: "vehicle.created" | "vehicle.status_changed";
  entityType: "vehicle";
  entityId: string;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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
