import type { ActionItem, CreateActionItemInput, CreateNotificationRuleInput, NotificationItem, NotificationRule, AlertRule, Assignment, AuditEvent, CreateAlertRuleInput, CreateDeviceInput, CreateDriverInput, CreateGeofenceInput, CreateLocationEventInput, CreateMaintenancePlanInput, CreateSafetyEventInput, CreateTireSetInput, CreateVehicleDocumentInput, CreateVehicleExpenseInput, CreateVehicleIncidentInput, CreateVehicleInspectionInput, Device, Driver, ExpenseSummary, Geofence, GeofenceEvent, IncidentSummary, InspectionSummary, LatestLocation, MaintenancePlan, Member, OperationalAlert, CreateVehicleInput, SafetyEvent, SafetySummary, SessionUser, ShiftRoute, TireSet, TireSummary, TrackingStatus, Vehicle, VehicleDocument, VehicleExpense, VehicleIncident, VehicleInspection, WorkShift } from "@filo/contracts";
import type { FleetReport } from "@filo/contracts";
import type { NotificationDelivery, NotificationPreferences } from "@filo/contracts";

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
  ,assignments: () => request<{assignments:Assignment[]}>("/api/operations/assignments")
  ,createAssignment: (vehicleId:string,driverId:string,deviceId:string|null) =>
    request<{assignment:Assignment}>("/api/operations/assignments",{method:"POST",body:JSON.stringify({vehicleId,driverId,deviceId})})
  ,endAssignment: (id:string) => request<void>(`/api/operations/assignments/${id}/end`,{method:"PATCH"})
  ,shifts: () => request<{shifts:WorkShift[]}>("/api/operations/shifts")
  ,startShift: (assignmentId:string) => request<{shift:{id:string}}>("/api/operations/shifts",{method:"POST",body:JSON.stringify({assignmentId})})
  ,endShift: (id:string) => request<void>(`/api/operations/shifts/${id}/end`,{method:"PATCH"})
  ,tracking: () => request<{tracking:TrackingStatus[]}>("/api/operations/tracking")
  ,updateTracking: (assignmentId:string,permission:TrackingStatus["permission"],state:TrackingStatus["state"]) =>
    request<{tracking:TrackingStatus}>(`/api/operations/tracking/${assignmentId}`,{method:"PATCH",body:JSON.stringify({permission,state})})
  ,sendLocation: (input:CreateLocationEventInput) =>
    request<{accepted:boolean;duplicate:boolean}>("/api/operations/locations",{method:"POST",body:JSON.stringify(input)})
  ,latestLocations: () => request<{locations:LatestLocation[]}>("/api/operations/locations/latest")
  ,shiftRoute: (shiftId:string) => request<{route:ShiftRoute}>(`/api/operations/shifts/${shiftId}/route`)
  ,geofences: () => request<{geofences:Geofence[]}>("/api/operations/geofences")
  ,createGeofence: (input:CreateGeofenceInput) => request<{geofence:Geofence}>("/api/operations/geofences",{method:"POST",body:JSON.stringify(input)})
  ,deactivateGeofence: (id:string) => request<void>(`/api/operations/geofences/${id}/deactivate`,{method:"PATCH"})
  ,geofenceEvents: () => request<{events:GeofenceEvent[]}>("/api/operations/geofence-events")
  ,alertRules: () => request<{rules:AlertRule[]}>("/api/operations/alert-rules")
  ,createAlertRule: (input:CreateAlertRuleInput) => request<{rule:AlertRule}>("/api/operations/alert-rules",{method:"POST",body:JSON.stringify(input)})
  ,alerts: () => request<{alerts:OperationalAlert[]}>("/api/operations/alerts")
  ,updateAlertStatus: (id:string,status:"acknowledged"|"resolved") => request<void>(`/api/operations/alerts/${id}/status`,{method:"PATCH",body:JSON.stringify({status})})
  ,maintenancePlans: () => request<{plans:MaintenancePlan[]}>("/api/maintenance")
  ,createMaintenancePlan: (input:CreateMaintenancePlanInput) => request<{plan:MaintenancePlan}>("/api/maintenance",{method:"POST",body:JSON.stringify(input)})
  ,completeMaintenance: (id:string,completedOdometerKm:number|null) => request<void>(`/api/maintenance/${id}/complete`,{method:"PATCH",body:JSON.stringify({completedOdometerKm})})
  ,expenses: () => request<{expenses:VehicleExpense[];summary:ExpenseSummary}>("/api/expenses")
  ,createExpense: (input:CreateVehicleExpenseInput) => request<{expense:VehicleExpense}>("/api/expenses",{method:"POST",body:JSON.stringify(input)})
  ,documents: () => request<{documents:VehicleDocument[]}>("/api/documents")
  ,createDocument: (input:CreateVehicleDocumentInput) => request<{document:VehicleDocument}>("/api/documents",{method:"POST",body:JSON.stringify(input)})
  ,updateDocumentStatus: (id:string,status:"renewed"|"cancelled") => request<void>(`/api/documents/${id}/status`,{method:"PATCH",body:JSON.stringify({status})})
  ,safetyEvents: () => request<{events:SafetyEvent[];summary:SafetySummary}>("/api/safety-events")
  ,createSafetyEvent: (input:CreateSafetyEventInput) => request<{event:SafetyEvent}>("/api/safety-events",{method:"POST",body:JSON.stringify(input)})
  ,updateSafetyEventStatus: (id:string,status:"reviewed"|"resolved") => request<void>(`/api/safety-events/${id}/status`,{method:"PATCH",body:JSON.stringify({status})})
  ,inspections: () => request<{inspections:VehicleInspection[];summary:InspectionSummary}>("/api/inspections")
  ,createInspection: (input:CreateVehicleInspectionInput) => request<{inspectionId:string}>("/api/inspections",{method:"POST",body:JSON.stringify(input)})
  ,updateInspectionDefectStatus: (id:string,status:"reviewed"|"resolved",resolutionNotes:string|null) => request<void>(`/api/inspections/defects/${id}/status`,{method:"PATCH",body:JSON.stringify({status,resolutionNotes})})
  ,tires: () => request<{tires:TireSet[];summary:TireSummary}>("/api/tires")
  ,createTireSet: (input:CreateTireSetInput) => request<{tireSetId:string}>("/api/tires",{method:"POST",body:JSON.stringify(input)})
  ,mountTireSet: (id:string,vehicleId:string,position:"front"|"rear"|"all",mountedOn:string,mountedOdometerKm:number) => request<void>(`/api/tires/${id}/mount`,{method:"POST",body:JSON.stringify({vehicleId,position,mountedOn,mountedOdometerKm})})
  ,removeTireSet: (id:string,removedOn:string,removedOdometerKm:number,reason:string) => request<void>(`/api/tires/${id}/remove`,{method:"POST",body:JSON.stringify({removedOn,removedOdometerKm,reason})})
  ,incidents: () => request<{incidents:VehicleIncident[];summary:IncidentSummary}>("/api/incidents")
  ,createIncident: (input:CreateVehicleIncidentInput) => request<{incident:VehicleIncident}>("/api/incidents",{method:"POST",body:JSON.stringify(input)})
  ,updateIncident: (id:string,status:"reviewing"|"resolved"|"closed",resolutionNotes:string|null,insuranceClaimNumber:string|null,actualCost:number|null) => request<void>(`/api/incidents/${id}`,{method:"PATCH",body:JSON.stringify({status,resolutionNotes,insuranceClaimNumber,actualCost})})
  ,report: (from:string,to:string,vehicleId:string|null=null) => request<FleetReport>(`/api/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${vehicleId?`&vehicleId=${encodeURIComponent(vehicleId)}`:""}`)
  ,reportCsvUrl: (from:string,to:string,vehicleId:string|null=null) => `${API_URL}/api/reports/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${vehicleId?`&vehicleId=${encodeURIComponent(vehicleId)}`:""}`
  ,actions: (status?:ActionItem["status"]) => request<{actions:ActionItem[]}>(`/api/actions${status?`?status=${status}`:""}`)
  ,generateActions: () => request<{created:number}>("/api/actions/generate",{method:"POST"})
  ,createAction: (input:CreateActionItemInput) => request<{action:ActionItem}>("/api/actions",{method:"POST",body:JSON.stringify(input)})
  ,updateAction: (id:string,status:ActionItem["status"],assignedUserId:string|null,dueOn:string|null) => request<void>(`/api/actions/${id}`,{method:"PATCH",body:JSON.stringify({status,assignedUserId,dueOn})})
  ,notificationRules: () => request<{rules:NotificationRule[]}>("/api/notifications/rules")
  ,createNotificationRule: (input:CreateNotificationRuleInput) => request<{rule:NotificationRule}>("/api/notifications/rules",{method:"POST",body:JSON.stringify(input)})
  ,updateNotificationRule: (id:string,status:"active"|"inactive") => request<void>(`/api/notifications/rules/${id}`,{method:"PATCH",body:JSON.stringify({status})})
  ,notifications: (status:"unread"|"read"|"all"="all") => request<{notifications:NotificationItem[];unread:number}>(`/api/notifications?status=${status}`)
  ,generateNotifications: () => request<{created:number}>("/api/notifications/generate",{method:"POST"})
  ,markNotificationRead: (id:string) => request<void>(`/api/notifications/${id}/read`,{method:"PATCH"})
  ,notificationPreferences: () => request<{preferences:NotificationPreferences}>("/api/notification-deliveries/preferences")
  ,updateNotificationPreferences: (input:Omit<NotificationPreferences,"updatedAt">) => request<void>("/api/notification-deliveries/preferences",{method:"PUT",body:JSON.stringify(input)})
  ,notificationDeliveries: () => request<{deliveries:NotificationDelivery[]}>("/api/notification-deliveries")
  ,enqueueNotificationDeliveries: () => request<{created:number}>("/api/notification-deliveries/enqueue",{method:"POST"})
};
