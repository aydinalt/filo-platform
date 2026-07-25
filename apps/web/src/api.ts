import type { AuditEvent, CreateVehicleInput, SessionUser, Vehicle } from "@filo/contracts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers }
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "REQUEST_FAILED");
  return body;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password })
    }),
  me: () => request<{ user: SessionUser }>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  vehicles: () => request<{ vehicles: Vehicle[] }>("/api/vehicles"),
  createVehicle: (vehicle: CreateVehicleInput) =>
    request<{ vehicle: Vehicle }>("/api/vehicles", {
      method: "POST", body: JSON.stringify(vehicle)
    }),
  updateVehicleStatus: (vehicleId: string, status: Vehicle["status"]) =>
    request<{ vehicle: Vehicle }>(`/api/vehicles/${vehicleId}/status`, {
      method: "PATCH", body: JSON.stringify({ status })
    }),
  auditEvents: () => request<{ events: AuditEvent[] }>("/api/audit")
};
