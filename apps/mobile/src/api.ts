import type {
  ClaimMobileEnrollmentInput,
  MobileLocationBatchInput,
  MobilePrincipal,
  MobileTrackingStateInput,
} from "@filo/contracts";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init: RequestInit = {}, credential?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-filo-csrf", "1");
  if (credential) headers.set("authorization", `Bearer ${credential}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "REQUEST_FAILED");
  return body as T;
}

export const mobileApi = {
  claim: (input: ClaimMobileEnrollmentInput) =>
    request<{ credential: string; principal: MobilePrincipal }>("/api/mobile/claim", {
      method: "POST", body: JSON.stringify(input),
    }),
  me: (credential: string) =>
    request<{ principal: MobilePrincipal }>("/api/mobile/me", {}, credential),
  startShift: (credential: string) =>
    request<{ shift: { id: string; existing: boolean } }>("/api/mobile/shift/start", { method: "POST" }, credential),
  endShift: (credential: string) =>
    request<void>("/api/mobile/shift/end", { method: "POST" }, credential),
  tracking: (credential: string, input: MobileTrackingStateInput) =>
    request("/api/mobile/tracking", { method: "PATCH", body: JSON.stringify(input) }, credential),
  locations: (credential: string, input: MobileLocationBatchInput) =>
    request<{ accepted: number; created: number; duplicate: number }>(
      "/api/mobile/locations/batch",
      { method: "POST", body: JSON.stringify(input) },
      credential,
    ),
};
