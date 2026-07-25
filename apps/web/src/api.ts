import type { AuditEvent, CreateDeviceInput, CreateDriverInput, Device, Driver, Member, CreateVehicleInput, SessionUser, Vehicle } from "@filo/contracts";

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
  ,drivers: () => request<{ drivers: Driver[] }>("/api/drivers")
  ,createDriver: (input: CreateDriverInput) => request<{driver:Driver}>("/api/drivers",{method:"POST",body:JSON.stringify(input)})
  ,devices: () => request<{ devices: Device[] }>("/api/devices")
  ,createDevice: (input: CreateDeviceInput) => request<{device:Device}>("/api/devices",{method:"POST",body:JSON.stringify(input)})
  ,members: () => request<{members:Member[]}>("/api/members")
  ,updateMemberRole: (userId:string,role:"admin"|"operator"|"viewer") =>
    request<{member:Member}>(`/api/members/${userId}/role`,{method:"PATCH",body:JSON.stringify({role})})
};
