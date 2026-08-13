import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ActionItem,
  AccountSession,
  AlertRule,
  Assignment,
  AuditEvent,
  CreateVehicleInput,
  Device,
  Driver,
  ExpenseSummary,
  Geofence,
  GeofenceEvent,
  IncidentSummary,
  InspectionSummary,
  LatestLocation,
  MaintenancePlan,
  Member,
  MemberInvitation,
  LaunchReadinessAssessment,
  LaunchReadinessEvidenceType,
  LaunchReadinessReview,
  MobileDeviceCommand,
  MobileDeviceStatus,
  MobileEnrollment,
  MobilePilotCohortReadiness,
  MobilePilotEvidenceType,
  MobilePilotPolicy,
  MobilePilotReleaseApproval,
  MobilePilotRun,
  MobileReleaseIncident,
  MobileReleaseRollout,
  MobileReleaseRolloutActionInput,
  NotificationItem,
  NotificationRule,
  OperationalAlert,
  SafetyEvent,
  SafetySummary,
  SessionUser,
  ShiftRoute,
  TireSet,
  TireSummary,
  TrackingStatus,
  Vehicle,
  VehicleDocument,
  VehicleExpense,
  VehicleIncident,
  VehicleInspection,
  WorkShift,
} from "@filo/contracts";
import type { FleetReport } from "@filo/contracts";
import type {
  NotificationAnalytics,
  NotificationDelivery,
  NotificationPreferences,
  NotificationProviderHealth,
  NotificationProviderIncident,
  NotificationProviderIncidentScanStatus,
  NotificationRetention,
  NotificationTemplate,
} from "@filo/contracts";
import { api } from "./api";

function invitationTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("invite") ?? "";
}

function passwordResetTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("reset") ?? "";
}

function slugifyTenant(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
}

const mobileHealthLabels: Record<MobileDeviceStatus["health"], string> = {
  healthy: "Sağlıklı",
  idle: "Beklemede",
  delayed: "Kuyruk gecikiyor",
  offline: "Çevrimdışı",
  permission_issue: "İzin sorunu",
  tracking_error: "Takip hatası",
  never_seen: "Heartbeat bekleniyor",
};

const mobilePilotEvidenceLabels: Record<MobilePilotEvidenceType, string> = {
  permission_always: "Arka plan izni",
  heartbeat_online: "Çevrimiçi heartbeat",
  background_location: "Arka plan konumu",
  offline_queue: "Çevrimdışı kuyruk",
  queue_recovered: "Bağlantı sonrası eşitleme",
  remote_control: "Uzaktan komut kanıtı",
};

const MOBILE_RELEASE_TARGET = "0.99.0";
const MOBILE_PREVIOUS_STABLE = "0.98.0";

const launchEvidenceLabels: Record<LaunchReadinessEvidenceType, string> = {
  privacy_legal: "Hukuk ve KVKK onayı",
  backup_restore: "Yedek geri yükleme kanıtı",
  worker_continuity: "Kesintisiz worker doğrulaması",
  monitoring_alerts: "İzleme ve alarm testi",
  support_oncall: "Canlı destek ve nöbet planı",
  rollback_drill: "Geri alma tatbikatı",
};

function InviteAcceptance({ token, onLogin }: { token: string; onLogin: (user: SessionUser) => void }) {
  const [preview, setPreview] = useState<{ tenantName: string; email: string; role: string; expiresAt: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.invitationPreview(token)
      .then((result) => setPreview(result.invitation))
      .catch(() => setError("Bu davet bağlantısı geçersiz, iptal edilmiş veya süresi dolmuş."));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.acceptInvitation({ token, fullName, password });
      window.history.replaceState({}, "", window.location.pathname);
      onLogin(result.user);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "EMAIL_ALREADY_REGISTERED"
        ? "Bu e-posta adresiyle zaten bir hesap bulunuyor."
        : "Davet kabul edilemedi. Bağlantı kullanılmış veya süresi dolmuş olabilir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell single-auth">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">FİLO DAVETİ</p>
        <h2>{preview ? `${preview.tenantName} ekibine katılın` : "Davet doğrulanıyor"}</h2>
        {preview && <p className="auth-context">{preview.email} · {preview.role} · {new Date(preview.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar geçerli</p>}
        <label>Ad soyad<input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={120} required disabled={!preview} /></label>
        <label>Parola<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={12} maxLength={128} required disabled={!preview} /></label>
        <small>En az 12 karakter, bir harf ve bir rakam kullanın.</small>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy || !preview}>{busy ? "Hesap hazırlanıyor…" : "Daveti kabul et"}</button>
        <button type="button" className="auth-link" onClick={() => { window.history.replaceState({}, "", window.location.pathname); window.location.reload(); }}>Giriş ekranına dön</button>
      </form>
    </main>
  );
}

function PasswordReset({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Parolalar eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      await api.completePasswordReset({ token, password });
      setMessage("Parolanız yenilendi. Tüm eski oturumlar kapatıldı; yeniden giriş yapabilirsiniz.");
    } catch {
      setError("Bağlantı geçersiz, kullanılmış veya 30 dakikalık süresi dolmuş.");
    } finally {
      setBusy(false);
    }
  }

  function returnToLogin() {
    window.history.replaceState({}, "", window.location.pathname);
    window.location.reload();
  }

  return (
    <main className="login-shell single-auth">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">HESAP KURTARMA</p>
        <h2>Yeni parolanızı belirleyin</h2>
        <p className="auth-context">Bağlantı yalnız bir kez kullanılabilir ve oluşturulduktan sonra 30 dakika geçerlidir.</p>
        {!message && <>
          <label>Yeni parola<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={12} maxLength={128} required /></label>
          <label>Yeni parola tekrar<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" minLength={12} maxLength={128} required /></label>
          <small>En az 12 karakter, bir harf ve bir rakam kullanın.</small>
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? "Parola yenileniyor…" : "Parolayı yenile"}</button>
        </>}
        {message && <p className="success" role="status">{message}</p>}
        <button type="button" className="auth-link" onClick={returnToLogin}>Giriş ekranına dön</button>
      </form>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        onLogin((await api.login(email, password)).user);
      } else if (mode === "register") {
        onLogin((await api.registerTenant({
          tenantName,
          tenantSlug,
          fullName,
          email,
          password,
          termsAccepted: true,
          privacyAccepted: true,
        })).user);
      } else {
        await api.requestPasswordReset({ email });
        setNotice("Bu e-posta kayıtlıysa 30 dakika geçerli parola yenileme bağlantısı gönderildi.");
      }
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(code === "TENANT_SLUG_TAKEN"
        ? "Bu firma adresi kullanılıyor. Farklı bir adres seçin."
        : code === "EMAIL_ALREADY_REGISTERED"
          ? "Bu e-posta adresiyle zaten bir hesap bulunuyor."
          : mode === "login"
            ? "E-posta veya parola hatalı."
            : mode === "register"
              ? "Firma hesabı oluşturulamadı. Bilgileri kontrol edin."
              : "Kurtarma isteği alınamadı. E-posta adresini kontrol edin.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-copy">
        <div className="brand">
          <span>F</span> Filo
        </div>
        <p className="eyebrow">OPERASYON KONTROL MERKEZİ</p>
        <h1>Filonuzdaki her araç, tek ve güvenli görünümde.</h1>
        <p>
          İlk dikey dilim; tenant izolasyonu, yönetici oturumu ve araç ana
          kaydını gerçek API üzerinden doğrular.
        </p>
        <div className="security-note">
          Tenant verileri PostgreSQL RLS ile birbirinden ayrılır.
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Giriş</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Yeni firma</button>
        </div>
        <p className="eyebrow">{mode === "login" ? "GÜVENLİ GİRİŞ" : mode === "register" ? "FİRMA KURULUMU" : "HESAP KURTARMA"}</p>
        <h2>{mode === "login" ? "Hesabınıza giriş yapın" : mode === "register" ? "Filonuzu oluşturmaya başlayın" : "Parolanızı yenileyin"}</h2>
        {mode === "register" && <>
          <label>Firma adı<input value={tenantName} onChange={(event) => { setTenantName(event.target.value); setTenantSlug(slugifyTenant(event.target.value)); }} minLength={2} maxLength={120} required /></label>
          <label>Firma adresi<input value={tenantSlug} onChange={(event) => setTenantSlug(slugifyTenant(event.target.value))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={2} maxLength={80} required /><small>İleride firma bağlantılarında kullanılacak: {tenantSlug || "firma-adi"}</small></label>
          <label>Ad soyad<input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={120} required /></label>
        </>}
        <label>
          E-posta
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        {mode !== "recover" && <label>
          Parola
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={mode === "register" ? 12 : 8}
            maxLength={128}
            required
          />
        </label>}
        {mode === "register" && <>
          <small>En az 12 karakter, bir harf ve bir rakam kullanın.</small>
          <label className="check-line"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /> Kullanım koşullarını kabul ediyorum.</label>
          <label className="check-line"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} required /> Gizlilik ve KVKK bilgilendirmesini okudum.</label>
        </>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="success" role="status">{notice}</p>}
        <button disabled={busy || (mode === "register" && (!termsAccepted || !privacyAccepted))}>
          {busy ? "İşlem yapılıyor…" : mode === "login" ? "Giriş yap" : mode === "register" ? "Firma hesabını oluştur" : "Yenileme bağlantısı gönder"}
        </button>
        {mode === "login" && <button type="button" className="auth-link" onClick={() => { setMode("recover"); setError(""); setNotice(""); }}>Parolamı unuttum</button>}
        {mode === "recover" && <button type="button" className="auth-link" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Giriş ekranına dön</button>}
        <small>{mode === "login" ? "Oturumunuz güvenli ve tenant kapsamlıdır." : mode === "register" ? "İlk kullanıcı owner yetkisiyle oluşturulur." : "Güvenlik nedeniyle hesap varlığı açıklanmaz."}</small>
      </form>
    </main>
  );
}

function VehicleForm({
  onCreated,
  onClose,
}: {
  onCreated: (v: Vehicle) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateVehicleInput>({
    plate: "",
    make: "",
    model: "",
    year: 2026,
    status: "active",
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      onCreated((await api.createVehicle(form)).vehicle);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "PLATE_ALREADY_EXISTS"
          ? "Bu plaka zaten kayıtlı."
          : "Araç kaydedilemedi.",
      );
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit} aria-label="Yeni araç">
        <div className="modal-head">
          <div>
            <p className="eyebrow">ARAÇ ANA KAYDI</p>
            <h2>Yeni araç ekle</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form-grid">
          <label>
            Plaka
            <input
              required
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
              placeholder="34 ABC 123"
            />
          </label>
          <label>
            Marka
            <input
              required
              value={form.make}
              onChange={(e) => setForm({ ...form, make: e.target.value })}
              placeholder="Ford"
            />
          </label>
          <label>
            Model
            <input
              required
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="Transit"
            />
          </label>
          <label>
            Model yılı
            <input
              required
              type="number"
              value={form.year}
              onChange={(e) =>
                setForm({ ...form, year: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button>Aracı kaydet</button>
        </div>
      </form>
    </div>
  );
}

function ProviderIncidentsPanel({
  incidents,
  scanStatus,
  focusedId,
  onSync,
  onUpdate,
}: {
  incidents: NotificationProviderIncident[];
  scanStatus: NotificationProviderIncidentScanStatus | null;
  focusedId: string | null;
  onSync: () => Promise<void>;
  onUpdate: (
    id: string,
    status: "acknowledged" | "resolved",
    notes: string | null,
  ) => Promise<void>;
}) {
  return (
    <section className="table-card spaced">
      <div className="section-head">
        <div>
          <p className="eyebrow">SAĞLAYICI OLAY YÖNETİMİ</p>
          <h2>Operasyon olayları</h2>
          <small>
            {scanStatus?.lastScanAt
              ? `Son tarama: ${new Date(scanStatus.lastScanAt).toLocaleString("tr-TR")} · ${scanStatus.intervalMinutes} dk aralık`
              : "Henüz sağlık taraması yapılmadı"}
          </small>
        </div>
        <button onClick={onSync}>Şimdi tara</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sağlayıcı</th>
              <th>Sorun</th>
              <th>Önem</th>
              <th>Durum</th>
              <th>Son kontrol</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr
                id={`provider-incident-${incident.id}`}
                className={
                  focusedId === incident.id ? "focused-row" : undefined
                }
                key={incident.id}
              >
                <td>
                  <b>{incident.providerName}</b>
                  <br />
                  <small>
                    {incident.channel} · {incident.provider}
                  </small>
                </td>
                <td>
                  {incident.issueTypes.join(", ")}
                  <br />
                  <small>{incident.occurrenceCount} kez algılandı</small>
                </td>
                <td>{incident.severity}</td>
                <td>
                  {incident.recoveryCandidateAt
                    ? "Çözülebilir"
                    : incident.status}
                  <br />
                  {incident.recoveryCandidateAt && (
                    <small>
                      {incident.healthyScanCount} ardışık sağlıklı tarama
                    </small>
                  )}
                </td>
                <td>
                  {incident.lastCheckedAt
                    ? new Date(incident.lastCheckedAt).toLocaleString("tr-TR")
                    : new Date(incident.lastDetectedAt).toLocaleString("tr-TR")}
                </td>
                <td>
                  {incident.status === "open" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        onUpdate(incident.id, "acknowledged", null)
                      }
                    >
                      Gördüm
                    </button>
                  )}
                  {incident.status !== "resolved" && (
                    <button
                      onClick={async () => {
                        const notes = window.prompt(
                          incident.recoveryCandidateAt
                            ? "Sağlık normale döndü. Çözüm notu"
                            : "Çözüm notu",
                        );
                        if (notes)
                          await onUpdate(incident.id, "resolved", notes);
                      }}
                    >
                      Çöz
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!incidents.length && (
        <div className="empty">
          <b>Açılmış sağlayıcı olayı yok</b>
          <p>
            Mevcut sağlık uyarılarını olaylaştırmak için taramayı çalıştırın.
          </p>
        </div>
      )}
    </section>
  );
}

function AccountSecurityPanel() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshSessions() {
    setSessions((await api.sessions()).sessions);
  }

  useEffect(() => {
    void refreshSessions().catch(() => setError("Oturumlar yüklenemedi."));
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmation) {
      setError("Yeni parolalar eşleşmiyor.");
      return;
    }
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setMessage("Parola değiştirildi ve diğer açık oturumlar kapatıldı.");
      await refreshSessions();
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "CURRENT_PASSWORD_INVALID"
        ? "Mevcut parola hatalı."
        : "Parola değiştirilemedi.");
    }
  }

  async function revokeSession(sessionId: string) {
    await api.revokeSession(sessionId);
    await refreshSessions();
  }

  return (
    <>
      <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">HESAP GÜVENLİĞİ</p><h2>Parola değiştir</h2></div></div>
        <form className="security-form" onSubmit={changePassword}>
          <label>Mevcut parola<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={8} maxLength={128} required /></label>
          <label>Yeni parola<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
          <label>Yeni parola tekrar<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} maxLength={128} required /></label>
          <button>Parolayı değiştir</button>
        </form>
        <small>Parola değiştirildiğinde bu oturum korunur, diğer tüm aktif oturumlar kapatılır.</small>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </section>
      <section className="table-card spaced">
        <div className="section-head"><div><p className="eyebrow">AKTİF OTURUMLAR</p><h2>Hesabınıza bağlı oturumlar</h2></div><button className="secondary" onClick={() => void refreshSessions()}>Yenile</button></div>
        <div className="table-wrap"><table><thead><tr><th>Oturum</th><th>Açılış</th><th>Geçerlilik</th><th>İşlem</th></tr></thead><tbody>
          {sessions.map((session) => <tr key={session.id}><td><b>{session.current ? "Bu cihaz" : `Oturum ${session.id.slice(0, 8)}`}</b></td><td>{new Date(session.createdAt).toLocaleString("tr-TR")}</td><td>{new Date(session.expiresAt).toLocaleString("tr-TR")}</td><td>{session.current ? "Aktif" : <button className="secondary" onClick={() => void revokeSession(session.id)}>Oturumu kapat</button>}</td></tr>)}
        </tbody></table></div>
      </section>
    </>
  );
}

function Dashboard({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberInvitations, setMemberInvitations] = useState<MemberInvitation[]>([]);
  const [invitationLink, setInvitationLink] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [tracking, setTracking] = useState<TrackingStatus[]>([]);
  const [locations, setLocations] = useState<LatestLocation[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<ShiftRoute | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [geofenceEvents, setGeofenceEvents] = useState<GeofenceEvent[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenancePlan[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [safetyEvents, setSafetyEvents] = useState<SafetyEvent[]>([]);
  const [safetySummary, setSafetySummary] = useState<SafetySummary>({
    total: 0,
    open: 0,
    serious: 0,
    assignmentCount: 0,
  });
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [inspectionSummary, setInspectionSummary] = useState<InspectionSummary>(
    { total: 0, unsafe: 0, openDefects: 0, criticalDefects: 0 },
  );
  const [tires, setTires] = useState<TireSet[]>([]);
  const [tireSummary, setTireSummary] = useState<TireSummary>({
    total: 0,
    mounted: 0,
    dueSoon: 0,
    overdue: 0,
  });
  const [incidents, setIncidents] = useState<VehicleIncident[]>([]);
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary>({
    total: 0,
    open: 0,
    critical: 0,
    estimatedExposure: 0,
  });
  const [report, setReport] = useState<FleetReport | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationRules, setNotificationRules] = useState<
    NotificationRule[]
  >([]);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>({
      emailEnabled: true,
      pushEnabled: true,
      quietHoursEnabled: false,
      quietStart: null,
      quietEnd: null,
      timezone: "Europe/Istanbul",
      updatedAt: null,
    });
  const [notificationDeliveries, setNotificationDeliveries] = useState<
    NotificationDelivery[]
  >([]);
  const [notificationTemplates, setNotificationTemplates] = useState<
    NotificationTemplate[]
  >([]);
  const [notificationAnalytics, setNotificationAnalytics] =
    useState<NotificationAnalytics | null>(null);
  const [notificationProviderHealth, setNotificationProviderHealth] =
    useState<NotificationProviderHealth | null>(null);
  const [notificationProviderIncidents, setNotificationProviderIncidents] =
    useState<NotificationProviderIncident[]>([]);
  const [
    notificationProviderIncidentScanStatus,
    setNotificationProviderIncidentScanStatus,
  ] = useState<NotificationProviderIncidentScanStatus | null>(null);
  const [notificationRetention, setNotificationRetention] =
    useState<NotificationRetention | null>(null);
  const [reconciliationFilter, setReconciliationFilter] = useState<
    "active" | "overdue" | "unassigned" | "resolved" | "all"
  >("active");
  const [focusedProviderIncidentId, setFocusedProviderIncidentId] = useState<
    string | null
  >(null);
  const [reportFrom, setReportFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [reportTo, setReportTo] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary>({
    totalAmount: 0,
    fuelAmount: 0,
    fuelLiters: 0,
    entryCount: 0,
    byVehicle: [],
  });
  const [view, setView] = useState<
    | "overview"
    | "vehicles"
    | "drivers"
    | "devices"
    | "operations"
    | "geofences"
    | "alerts"
    | "maintenance"
    | "expenses"
    | "documents"
    | "safety"
    | "inspections"
    | "tires"
    | "incidents"
    | "reports"
    | "actions"
    | "notifications"
    | "mobile"
    | "members"
    | "security"
    | "audit"
  >("overview");
  const [error, setError] = useState("");
  const [mobileAssignment, setMobileAssignment] = useState("");
  const [mobileMessage, setMobileMessage] = useState("Takip kapalı");
  const [mobileEnrollments, setMobileEnrollments] = useState<MobileEnrollment[]>([]);
  const [mobileDeviceStatuses, setMobileDeviceStatuses] = useState<MobileDeviceStatus[]>([]);
  const [mobileDeviceCommands, setMobileDeviceCommands] = useState<MobileDeviceCommand[]>([]);
  const [mobilePilotRuns, setMobilePilotRuns] = useState<MobilePilotRun[]>([]);
  const [mobilePilotCohort, setMobilePilotCohort] = useState<MobilePilotCohortReadiness>({
    targetVersion: MOBILE_RELEASE_TARGET,
    iosPassed: 0,
    androidPassed: 0,
    distinctAndroidModels: 0,
    requiredIos: 1,
    requiredAndroid: 2,
    requiredDistinctAndroidModels: 2,
    ready: false,
    missing: [],
    devices: [],
  });
  const [mobilePilotApprovals, setMobilePilotApprovals] = useState<MobilePilotReleaseApproval[]>([]);
  const [mobileReleaseRollouts, setMobileReleaseRollouts] = useState<MobileReleaseRollout[]>([]);
  const [mobileReleaseIncidents, setMobileReleaseIncidents] = useState<MobileReleaseIncident[]>([]);
  const [launchReadinessAssessment, setLaunchReadinessAssessment] = useState<LaunchReadinessAssessment>({
    targetVersion: MOBILE_RELEASE_TARGET,
    ready: false,
    checks: [],
  });
  const [launchReadinessReviews, setLaunchReadinessReviews] = useState<LaunchReadinessReview[]>([]);
  const [mobilePilotPolicy, setMobilePilotPolicy] = useState<MobilePilotPolicy>({
    trackingEnabled: true,
    minimumAppVersion: null,
    heartbeatIntervalSeconds: 60,
    updatedAt: null,
  });
  const [minimumMobileVersion, setMinimumMobileVersion] = useState("");
  const [mobileEnrollmentToken, setMobileEnrollmentToken] = useState("");
  const watchId = useRef<number | null>(null);

  const filteredReconciliations =
    notificationRetention?.recentReconciliations.filter((reconciliation) => {
      if (reconciliationFilter === "all") return true;
      if (reconciliationFilter === "active")
        return ["open", "acknowledged"].includes(
          reconciliation.handlingStatus,
        );
      if (reconciliationFilter === "overdue")
        return reconciliation.isHandlingOverdue;
      if (reconciliationFilter === "unassigned")
        return (
          ["open", "acknowledged"].includes(
            reconciliation.handlingStatus,
          ) && !reconciliation.assignedTo
        );
      return reconciliation.handlingStatus === "resolved";
    }) ?? [];

  async function refresh() {
    setError("");
    try {
      const [
        vehicleResult,
        auditResult,
        driverResult,
        deviceResult,
        assignmentResult,
        shiftResult,
        trackingResult,
        locationResult,
        geofenceResult,
        geofenceEventResult,
        alertRuleResult,
        alertResult,
        maintenanceResult,
        expenseResult,
        documentResult,
        safetyResult,
        inspectionResult,
        tireResult,
        incidentResult,
        actionResult,
        notificationResult,
        notificationRuleResult,
        preferenceResult,
        deliveryResult,
        templateResult,
      ] = await Promise.all([
        api.vehicles(),
        api.auditEvents(),
        api.drivers(),
        api.devices(),
        api.assignments(),
        api.shifts(),
        api.tracking(),
        api.latestLocations(),
        api.geofences(),
        api.geofenceEvents(),
        api.alertRules(),
        api.alerts(),
        api.maintenancePlans(),
        api.expenses(),
        api.documents(),
        api.safetyEvents(),
        api.inspections(),
        api.tires(),
        api.incidents(),
        api.actions(),
        api.notifications(),
        api.notificationRules(),
        api.notificationPreferences(),
        user.role === "viewer"
          ? Promise.resolve({ deliveries: [] })
          : api.notificationDeliveries(),
        user.role === "viewer"
          ? Promise.resolve({ templates: [] })
          : api.notificationTemplates(),
      ]);
      setVehicles(vehicleResult.vehicles);
      setEvents(auditResult.events);
      setDrivers(driverResult.drivers);
      setDevices(deviceResult.devices);
      setAssignments(assignmentResult.assignments);
      setShifts(shiftResult.shifts);
      setTracking(trackingResult.tracking);
      setLocations(locationResult.locations);
      setGeofences(geofenceResult.geofences);
      setGeofenceEvents(geofenceEventResult.events);
      setAlertRules(alertRuleResult.rules);
      setAlerts(alertResult.alerts);
      setMaintenance(maintenanceResult.plans);
      setExpenses(expenseResult.expenses);
      setExpenseSummary(expenseResult.summary);
      setDocuments(documentResult.documents);
      setSafetyEvents(safetyResult.events);
      setSafetySummary(safetyResult.summary);
      setInspections(inspectionResult.inspections);
      setInspectionSummary(inspectionResult.summary);
      setTires(tireResult.tires);
      setTireSummary(tireResult.summary);
      setIncidents(incidentResult.incidents);
      setIncidentSummary(incidentResult.summary);
      setActions(actionResult.actions);
      setNotifications(notificationResult.notifications);
      setNotificationRules(notificationRuleResult.rules);
      setNotificationPreferences(preferenceResult.preferences);
      setNotificationDeliveries(deliveryResult.deliveries);
      setNotificationTemplates(templateResult.templates);
      if (user.role !== "viewer") {
        setMobileEnrollments((await api.mobileEnrollments()).enrollments);
        setMobileDeviceStatuses((await api.mobileDeviceStatuses()).devices);
        const policyResult = await api.mobilePilotPolicy();
        setMobilePilotPolicy(policyResult.policy);
        setMinimumMobileVersion(policyResult.policy.minimumAppVersion ?? "");
        setMobileDeviceCommands((await api.mobileDeviceCommands()).commands);
        setMobilePilotRuns((await api.mobilePilotRuns()).runs);
        const releaseResult = await api.mobilePilotRelease(MOBILE_RELEASE_TARGET);
        setMobilePilotCohort(releaseResult.readiness);
        setMobilePilotApprovals(releaseResult.approvals);
        setMobileReleaseRollouts((await api.mobileReleaseRollouts()).rollouts);
        setMobileReleaseIncidents((await api.mobileReleaseIncidents()).incidents);
        const launchResult = await api.launchReadiness(MOBILE_RELEASE_TARGET);
        setLaunchReadinessAssessment(launchResult.assessment);
        setLaunchReadinessReviews(launchResult.reviews);
        setNotificationAnalytics((await api.notificationAnalytics()).analytics);
        setNotificationProviderHealth(await api.notificationProviderHealth());
        const providerIncidentResult =
          await api.notificationProviderIncidents();
        setNotificationProviderIncidents(providerIncidentResult.incidents);
        setNotificationProviderIncidentScanStatus(
          providerIncidentResult.scanStatus,
        );
        setNotificationRetention(await api.notificationRetention());
      }
      if (["owner", "admin"].includes(user.role)) {
        const [memberResult, invitationResult] = await Promise.all([
          api.members(),
          api.memberInvitations(),
        ]);
        setMembers(memberResult.members);
        setMemberInvitations(invitationResult.invitations);
      }
    } catch {
      setError(
        "Veriler yüklenemedi. API ve veritabanı bağlantısını kontrol edin.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(
    () => () => {
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  async function startMobileTracking() {
    if (!mobileAssignment) {
      setMobileMessage("Önce aktif bir atama seçin.");
      return;
    }
    if (!navigator.geolocation) {
      setMobileMessage("Bu cihaz konum özelliğini desteklemiyor.");
      return;
    }
    await api.updateTracking(
      mobileAssignment,
      "granted_while_in_use",
      "tracking",
    );
    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await api.sendLocation({
            assignmentId: mobileAssignment,
            eventId: crypto.randomUUID(),
            recordedAt: new Date(position.timestamp).toISOString(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            speedMps: position.coords.speed,
            headingDegrees: position.coords.heading,
          });
          setMobileMessage(
            `Konum gönderildi · ${new Date().toLocaleTimeString("tr-TR")}`,
          );
          setLocations((await api.latestLocations()).locations);
        } catch (e) {
          setMobileMessage(
            e instanceof Error && e.message === "TRACKING_NOT_ACTIVE"
              ? "Aktif vardiya olmadan konum gönderilemez."
              : "Konum gönderilemedi.",
          );
        }
      },
      () => setMobileMessage("Konum izni verilmedi veya konum alınamadı."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    setMobileMessage("Konum izni bekleniyor…");
  }
  async function stopMobileTracking() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (mobileAssignment)
      await api.updateTracking(
        mobileAssignment,
        "granted_while_in_use",
        "paused",
      );
    setMobileMessage("Takip kullanıcı tarafından durduruldu.");
    await refresh();
  }

  async function createNativeMobileEnrollment() {
    if (!mobileAssignment) {
      setMobileMessage("Önce aktif bir atama seçin.");
      return;
    }
    const assignment = assignments.find((item) => item.id === mobileAssignment);
    if (!assignment) return;
    try {
      const result = await api.createMobileEnrollment({
        assignmentId: mobileAssignment,
        label: `${assignment.vehiclePlate} sürücü telefonu`,
      });
      setMobileEnrollmentToken(result.token);
      setMobileMessage("15 dakikalık tek kullanımlık kayıt kodu oluşturuldu.");
      setMobileEnrollments((await api.mobileEnrollments()).enrollments);
    } catch {
      setMobileMessage("Mobil kayıt kodu oluşturulamadı.");
    }
  }

  async function revokeNativeMobileEnrollment(id: string) {
    await api.revokeMobileEnrollment(id);
    setMobileEnrollments((await api.mobileEnrollments()).enrollments);
    setMobileEnrollmentToken("");
    setMobileMessage("Mobil kayıt ve bağlı erişim iptal edildi.");
  }

  async function saveMobilePilotPolicy(trackingEnabled = mobilePilotPolicy.trackingEnabled) {
    try {
      const result = await api.updateMobilePilotPolicy({
        trackingEnabled,
        minimumAppVersion: minimumMobileVersion.trim() || null,
        heartbeatIntervalSeconds: mobilePilotPolicy.heartbeatIntervalSeconds,
      });
      setMobilePilotPolicy(result.policy);
      setMobileMessage(trackingEnabled
        ? "Mobil pilot politikası güncellendi."
        : "Acil durdurma aktif; cihazlar bir sonraki kontrolde takibi kapatacak.");
      setEvents((await api.auditEvents()).events);
    } catch {
      setMobileMessage("Pilot politikası güncellenemedi. Sürüm biçimi 0.94.0 gibi olmalıdır.");
    }
  }

  async function sendMobileDeviceCommand(
    credentialId: string,
    type: "pause_tracking" | "resume_tracking" | "sync_now",
  ) {
    const reason = window.prompt(
      type === "pause_tracking" ? "Takibi durdurma nedeni" : type === "resume_tracking" ? "Takibi yeniden açma nedeni" : "Eşitleme isteği nedeni",
      type === "pause_tracking" ? "Pilot güvenlik müdahalesi" : type === "resume_tracking" ? "Pilot kontrolü tamamlandı" : "Pilot veri kontrolü",
    )?.trim();
    if (!reason) return;
    try {
      await api.createMobileDeviceCommand(credentialId, { type, reason });
      setMobileDeviceCommands((await api.mobileDeviceCommands()).commands);
      setMobileMessage("Cihaz komutu kuyruğa alındı; sonraki heartbeat sırasında uygulanacak.");
    } catch {
      setMobileMessage("Cihaz bulunamadı veya aynı türde bekleyen bir komut zaten var.");
    }
  }

  async function startMobilePilotRun(credentialId: string) {
    const notes = window.prompt(
      "Pilot notu (opsiyonel)",
      "Fiziksel cihaz arka plan ve çevrimdışı saha testi",
    )?.trim();
    if (notes === undefined) return;
    try {
      await api.startMobilePilotRun(credentialId, { notes: notes || null });
      setMobilePilotRuns((await api.mobilePilotRuns()).runs);
      setMobileMessage("Fiziksel cihaz pilotu başladı; kanıtlar otomatik toplanacak.");
    } catch {
      setMobileMessage("Cihaz bulunamadı veya bu cihazda zaten aktif bir pilot var.");
    }
  }

  async function decideMobilePilotRun(
    run: MobilePilotRun,
    decision: "passed" | "failed" | "cancelled",
  ) {
    const notes = window.prompt(
      decision === "passed" ? "Geçme kararı notu" : decision === "failed" ? "Kalma nedeni" : "İptal nedeni",
      decision === "passed" ? "Zorunlu saha kanıtlarının tamamı doğrulandı." : "Fiziksel cihaz pilotu tamamlanamadı.",
    )?.trim();
    if (!notes) return;
    try {
      await api.decideMobilePilotRun(run.id, { decision, notes });
      setMobilePilotRuns((await api.mobilePilotRuns()).runs);
      setEvents((await api.auditEvents()).events);
      setMobileMessage(decision === "passed" ? "Pilot geçme kararı kaydedildi." : "Pilot kararı kaydedildi.");
    } catch (caught) {
      setMobileMessage(caught instanceof Error && caught.message === "PILOT_EVIDENCE_INCOMPLETE"
        ? `Pilot henüz geçemez; ${run.readiness.missing.length} zorunlu kanıt eksik.`
        : "Pilot kararı kaydedilemedi.");
    }
  }

  async function approveMobilePilotRelease() {
    const notes = window.prompt(
      `${MOBILE_RELEASE_TARGET} üretim onayı notu`,
      "1 iPhone ve 2 farklı Android/OEM modeli saha pilotunu geçti.",
    )?.trim();
    if (!notes) return;
    try {
      await api.approveMobilePilotRelease({ targetVersion: MOBILE_RELEASE_TARGET, notes });
      const result = await api.mobilePilotRelease(MOBILE_RELEASE_TARGET);
      setMobilePilotCohort(result.readiness);
      setMobilePilotApprovals(result.approvals);
      setEvents((await api.auditEvents()).events);
      setMobileMessage(`${MOBILE_RELEASE_TARGET} üretim onayı kaydedildi.`);
    } catch (caught) {
      setMobileMessage(caught instanceof Error && caught.message === "MOBILE_PILOT_COHORT_INCOMPLETE"
        ? "Üretim onayı verilemez; çoklu cihaz pilot matrisi eksik."
        : "Bu sürüm zaten onaylı veya onay kaydedilemedi.");
    }
  }

  async function revokeMobilePilotRelease(approval: MobilePilotReleaseApproval) {
    const reason = window.prompt("Üretim onayını geri çekme nedeni")?.trim();
    if (!reason) return;
    try {
      await api.revokeMobilePilotRelease(approval.id, { reason });
      const result = await api.mobilePilotRelease(MOBILE_RELEASE_TARGET);
      setMobilePilotCohort(result.readiness);
      setMobilePilotApprovals(result.approvals);
      setEvents((await api.auditEvents()).events);
      setMobileMessage("Üretim onayı geri çekildi; yeniden onay verilene kadar yayın kapalıdır.");
    } catch {
      setMobileMessage("Aktif üretim onayı bulunamadı veya geri çekilemedi.");
    }
  }

  async function createMobileReleaseRollout() {
    const notes = window.prompt(
      `${MOBILE_RELEASE_TARGET} rollout planı notu`,
      `%10 başlangıç grubu; sağlıksız cihaz oranı en fazla %10.`,
    )?.trim();
    if (!notes) return;
    try {
      await api.createMobileReleaseRollout({
        targetVersion: MOBILE_RELEASE_TARGET,
        previousStableVersion: MOBILE_PREVIOUS_STABLE,
        maxUnhealthyPercent: 10,
        guardMode: "auto_rollback",
        rollbackAfterBreaches: 3,
        notes,
      });
      setMobileReleaseRollouts((await api.mobileReleaseRollouts()).rollouts);
      setEvents((await api.auditEvents()).events);
      setMobileMessage("Kontrollü rollout planı oluşturuldu; owner başlatana kadar taslakta kalacak.");
    } catch {
      setMobileMessage("Rollout planı için aktif üretim onayı gerekir veya bu sürümün planı zaten vardır.");
    }
  }

  async function updateMobileReleaseIncident(
    incident: MobileReleaseIncident,
    status: "acknowledged" | "resolved",
  ) {
    const notes = window.prompt(
      status === "acknowledged" ? "Olay inceleme notu" : "Çözüm ve doğrulama notu",
      status === "acknowledged" ? "Rollout durduruldu; cihaz sağlık sinyalleri inceleniyor." : "Kök neden giderildi ve seçili cihazlar doğrulandı.",
    )?.trim();
    if (!notes) return;
    try {
      await api.updateMobileReleaseIncident(incident.id, { status, notes });
      setMobileReleaseIncidents((await api.mobileReleaseIncidents()).incidents);
      setEvents((await api.auditEvents()).events);
      setMobileMessage(status === "acknowledged" ? "Yayın olayı owner tarafından kabul edildi." : "Yayın olayı çözüm kanıtıyla kapatıldı.");
    } catch {
      setMobileMessage("Yayın olayı artık aktif değil veya durum geçişi uygulanamadı.");
    }
  }

  async function actOnMobileReleaseRollout(
    rollout: MobileReleaseRollout,
    action: MobileReleaseRolloutActionInput["action"],
  ) {
    const reason = window.prompt("Rollout karar nedeni", "Cihaz sağlık kapısı ve saha sinyalleri kontrol edildi.")?.trim();
    if (!reason) return;
    let input: MobileReleaseRolloutActionInput;
    if (action === "advance") {
      const next = rollout.targetPercentage === 10 ? 25 : rollout.targetPercentage === 25 ? 50 : 100;
      input = { action, targetPercentage: next, reason };
    } else {
      input = { action, reason };
    }
    try {
      await api.actOnMobileReleaseRollout(rollout.id, input);
      setMobileReleaseRollouts((await api.mobileReleaseRollouts()).rollouts);
      setEvents((await api.auditEvents()).events);
      setMobileMessage(action === "rollback" ? "Rollout geri alındı ve karar kanıtı saklandı." : "Rollout durumu güncellendi.");
    } catch (caught) {
      setMobileMessage(caught instanceof Error && caught.message === "MOBILE_RELEASE_ROLLOUT_HEALTH_GATE_FAILED"
        ? "Aşama ilerletilemedi; hedef sürüm cihaz sağlık kapısı henüz geçmiyor."
        : "Rollout geçişi mevcut durum, sıra veya üretim onayı nedeniyle uygulanamadı.");
    }
  }

  async function refreshLaunchReadiness() {
    const result = await api.launchReadiness(MOBILE_RELEASE_TARGET);
    setLaunchReadinessAssessment(result.assessment);
    setLaunchReadinessReviews(result.reviews);
  }

  async function createLaunchReadinessReview() {
    const notes = window.prompt(
      "Canlıya geçiş inceleme notu",
      "v1.0 öncesi teknik, hukuki ve operasyonel kanıtlar toplanacak.",
    )?.trim();
    if (!notes) return;
    try {
      await api.createLaunchReadinessReview({ targetVersion: MOBILE_RELEASE_TARGET, notes });
      await refreshLaunchReadiness();
      setEvents((await api.auditEvents()).events);
      setMobileMessage("Canlıya geçiş incelemesi açıldı; altı kanıt tamamlanmayı bekliyor.");
    } catch {
      setMobileMessage("Bu sürüm için zaten açık bir canlıya geçiş incelemesi var.");
    }
  }

  async function updateLaunchEvidence(review: LaunchReadinessReview, type: LaunchReadinessEvidenceType) {
    const current = review.evidence.find((item) => item.type === type);
    const status = current?.status === "passed" ? "pending" : "passed";
    const notes = window.prompt(
      `${launchEvidenceLabels[type]} kanıt notu`,
      status === "passed" ? "Kontrol uygulandı; tarih, sorumlu ve sonuç doğrulandı." : "Kanıt yeniden doğrulanacak.",
    )?.trim();
    if (!notes) return;
    try {
      await api.updateLaunchReadinessEvidence(review.id, type, { status, notes });
      await refreshLaunchReadiness();
      setEvents((await api.auditEvents()).events);
      setMobileMessage(`${launchEvidenceLabels[type]} güncellendi.`);
    } catch {
      setMobileMessage("Kararı verilmiş incelemenin kanıtları değiştirilemez.");
    }
  }

  async function decideLaunchReadiness(review: LaunchReadinessReview, decision: "go" | "no_go") {
    const notes = window.prompt(
      decision === "go" ? "GO kararı ve kapsamı" : "NO-GO gerekçesi ve düzeltme planı",
      decision === "go" ? "Tüm kapılar ve kanıtlar doğrulandı; kontrollü canlı geçiş onaylandı." : "Eksik kapılar tamamlanmadan canlıya geçilmeyecek.",
    )?.trim();
    if (!notes) return;
    try {
      await api.decideLaunchReadiness(review.id, { decision, notes });
      await refreshLaunchReadiness();
      setEvents((await api.auditEvents()).events);
      setMobileMessage(decision === "go" ? "GO kararı değiştirilemez kanıt görüntüsüyle kaydedildi." : "NO-GO kararı ve gerekçesi kaydedildi.");
    } catch (caught) {
      setMobileMessage(caught instanceof Error && caught.message === "LAUNCH_READINESS_GATE_FAILED"
        ? "GO kararı verilemez; otomatik veya operasyonel kapılardan en az biri eksik."
        : "Canlıya geçiş kararı kaydedilemedi.");
    }
  }

  async function changeStatus(vehicle: Vehicle, status: Vehicle["status"]) {
    setError("");
    try {
      const result = await api.updateVehicleStatus(vehicle.id, status);
      setVehicles((current) =>
        current.map((item) => (item.id === vehicle.id ? result.vehicle : item)),
      );
      setEvents((await api.auditEvents()).events);
    } catch {
      setError("Araç durumu güncellenemedi.");
    }
  }

  async function inviteMember() {
    const email = window.prompt("Davet edilecek e-posta adresi")?.trim();
    if (!email) return;
    const allowedRoles = user.role === "owner" ? ["admin", "operator", "viewer"] : ["operator", "viewer"];
    const role = window.prompt(`Rol (${allowedRoles.join(" / ")})`, "operator")?.trim().toLowerCase();
    if (!role || !allowedRoles.includes(role)) {
      setError("Geçerli bir davet rolü seçin.");
      return;
    }
    try {
      const result = await api.createMemberInvitation({
        email,
        role: role as "admin" | "operator" | "viewer",
      });
      const link = `${window.location.origin}${window.location.pathname}?invite=${result.token}`;
      setInvitationLink(link);
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      await refresh();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(code === "INVITATION_ALREADY_PENDING"
        ? "Bu e-posta için zaten bekleyen bir davet var."
        : code === "EMAIL_ALREADY_REGISTERED"
          ? "Bu e-posta adresi zaten kayıtlı."
          : "Davet oluşturulamadı.");
    }
  }

  async function revokeInvitation(invitationId: string) {
    try {
      await api.revokeMemberInvitation(invitationId);
      await refresh();
    } catch {
      setError("Davet iptal edilemedi.");
    }
  }

  async function changeMemberAccess(member: Member) {
    try {
      await api.updateMemberAccess(member.userId, member.status !== "active");
      await refresh();
    } catch {
      setError("Kullanıcı erişimi güncellenemedi.");
    }
  }

  const active = vehicles.filter((v) => v.status === "active").length;
  const activeMobileReleaseApproval = mobilePilotApprovals.find((approval) =>
    approval.targetVersion === MOBILE_RELEASE_TARGET && approval.status === "approved",
  );
  const currentMobileRollout = mobileReleaseRollouts.find((rollout) => rollout.targetVersion === MOBILE_RELEASE_TARGET);
  const draftLaunchReview = launchReadinessReviews.find((review) => review.status === "draft");
  const currentLaunchReview = draftLaunchReview ?? launchReadinessReviews[0];
  const launchEvidenceReady = currentLaunchReview?.evidence.every((item) => item.status === "passed") ?? false;
  async function addDriver() {
    const fullName = window.prompt("Sürücü adı soyadı");
    if (!fullName) return;
    const phone = window.prompt("Telefon numarası");
    if (!phone) return;
    try {
      await api.createDriver({ fullName, phone, status: "active" });
      await refresh();
    } catch {
      setError(
        "Sürücü eklenemedi. Telefon numarası daha önce kullanılmış olabilir.",
      );
    }
  }
  async function addDevice() {
    const ownership = window.confirm(
      "Şirket cihazı mı? Evet: şirket, Hayır: kişisel",
    )
      ? "company"
      : "personal";
    const platform = window.confirm(
      "Android cihaz mı? Evet: Android, Hayır: iOS",
    )
      ? "android"
      : "ios";
    const model = window.prompt("Cihaz marka/modeli");
    if (!model) return;
    const driverId =
      window.prompt("Atanacak sürücünün ID'si (boş bırakılabilir)") || null;
    const identifier =
      ownership === "company"
        ? window.prompt("Envanter/seri numarası (opsiyonel)") || undefined
        : undefined;
    try {
      await api.createDevice({
        ownership,
        platform,
        model,
        driverId,
        identifier,
        status: "active",
      });
      await refresh();
    } catch {
      setError("Cihaz eklenemedi. Sürücü ID'sini kontrol edin.");
    }
  }
  async function addAssignment() {
    const vehicleId = window.prompt("Araç ID");
    if (!vehicleId) return;
    const driverId = window.prompt("Sürücü ID");
    if (!driverId) return;
    const deviceId = window.prompt("Cihaz ID (opsiyonel)") || null;
    try {
      await api.createAssignment(vehicleId, driverId, deviceId);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "ACTIVE_ASSIGNMENT_CONFLICT"
          ? "Araç veya sürücünün zaten aktif ataması var."
          : "Atama oluşturulamadı.",
      );
    }
  }
  async function addGeofence() {
    const name = window.prompt("Bölge adı (ör. Merkez Depo)");
    if (!name) return;
    const latitude = Number(window.prompt("Merkez enlem (ör. 41.015)"));
    const longitude = Number(window.prompt("Merkez boylam (ör. 29.010)"));
    const radiusMeters = Number(
      window.prompt("Yarıçap metre (50–50000)", "250"),
    );
    try {
      await api.createGeofence({ name, latitude, longitude, radiusMeters });
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "GEOFENCE_NAME_EXISTS"
          ? "Bu adla aktif bir bölge zaten var."
          : "Bölge oluşturulamadı; koordinat ve yarıçapı kontrol edin.",
      );
    }
  }
  async function addAlertRule() {
    const name = window.prompt("Uyarı kuralı adı");
    if (!name) return;
    const type = window.prompt(
      "Tür: speeding, geofence_entered veya geofence_exited",
      "speeding",
    );
    if (
      !type ||
      !["speeding", "geofence_entered", "geofence_exited"].includes(type)
    ) {
      setError("Geçerli bir uyarı türü seçin.");
      return;
    }
    const speeding = type === "speeding";
    const thresholdKph = speeding
      ? Number(window.prompt("Hız eşiği (km/sa)", "120"))
      : null;
    const geofenceId = speeding ? null : window.prompt("Bölge ID");
    try {
      await api.createAlertRule({
        name,
        type: type as "speeding" | "geofence_entered" | "geofence_exited",
        thresholdKph,
        geofenceId: geofenceId || null,
      });
      await refresh();
    } catch {
      setError(
        "Uyarı kuralı oluşturulamadı; tür ve hedef değerlerini kontrol edin.",
      );
    }
  }
  async function addMaintenance() {
    const vehicleId = window.prompt("Bakım planlanacak araç ID");
    if (!vehicleId) return;
    const title = window.prompt("Bakım adı (ör. Periyodik bakım)");
    if (!title) return;
    const dueDate =
      window.prompt("Hedef tarih (YYYY-AA-GG, boş bırakılabilir)") || null;
    const kmText = window.prompt("Hedef kilometre (boş bırakılabilir)") || "";
    const dueOdometerKm = kmText ? Number(kmText) : null;
    try {
      await api.createMaintenancePlan({
        vehicleId,
        title,
        dueDate,
        dueOdometerKm,
        notes: null,
      });
      await refresh();
    } catch {
      setError(
        "Bakım planı oluşturulamadı; araç ID, tarih veya kilometre hedefini kontrol edin.",
      );
    }
  }
  async function addExpense() {
    const vehicleId = window.prompt("Gider kaydedilecek araç ID");
    if (!vehicleId) return;
    const category = window.prompt(
      "Tür: fuel, toll, parking, wash, repair veya other",
      "fuel",
    );
    if (
      !category ||
      !["fuel", "toll", "parking", "wash", "repair", "other"].includes(category)
    ) {
      setError("Geçerli bir gider türü seçin.");
      return;
    }
    const amount = Number(window.prompt("Tutar (TL)", "1000"));
    const occurredOn = window.prompt(
      "Tarih (YYYY-AA-GG)",
      new Date().toISOString().slice(0, 10),
    );
    if (!occurredOn) return;
    const kmText = window.prompt("Araç kilometresi (opsiyonel)") || "";
    const liters =
      category === "fuel" ? Number(window.prompt("Yakıt litresi", "40")) : null;
    const description = window.prompt("Açıklama (opsiyonel)") || null;
    try {
      await api.createExpense({
        vehicleId,
        category: category as
          | "fuel"
          | "toll"
          | "parking"
          | "wash"
          | "repair"
          | "other",
        occurredOn,
        amount,
        odometerKm: kmText ? Number(kmText) : null,
        liters,
        description,
      });
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "ODOMETER_ROLLBACK"
          ? "Kilometre önceki kayıttan düşük olamaz."
          : "Gider kaydedilemedi; araç, tarih ve tutar alanlarını kontrol edin.",
      );
    }
  }
  async function addDocument() {
    const vehicleId = window.prompt("Belge eklenecek araç ID");
    if (!vehicleId) return;
    const documentType = window.prompt(
      "Tür: traffic_insurance, casco, inspection, registration veya other",
      "traffic_insurance",
    );
    if (
      !documentType ||
      ![
        "traffic_insurance",
        "casco",
        "inspection",
        "registration",
        "other",
      ].includes(documentType)
    ) {
      setError("Geçerli bir belge türü seçin.");
      return;
    }
    const documentNumber =
      window.prompt("Belge/poliçe numarası (opsiyonel)") || null;
    const validFrom =
      window.prompt("Başlangıç tarihi (YYYY-AA-GG, opsiyonel)") || null;
    const expiresOn =
      window.prompt("Bitiş tarihi (YYYY-AA-GG; ruhsat için boş olabilir)") ||
      null;
    const notes = window.prompt("Not (opsiyonel)") || null;
    try {
      await api.createDocument({
        vehicleId,
        documentType: documentType as
          | "traffic_insurance"
          | "casco"
          | "inspection"
          | "registration"
          | "other",
        documentNumber,
        validFrom,
        expiresOn,
        notes,
      });
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "ACTIVE_DOCUMENT_EXISTS"
          ? "Bu araçta aynı türde aktif belge zaten var; önce mevcut belgeyi yenilendi olarak kapatın."
          : "Belge kaydedilemedi; araç ve tarih alanlarını kontrol edin.",
      );
    }
  }
  async function addSafetyEvent() {
    const assignmentId = window.prompt("Olayın atama ID'si");
    if (!assignmentId) return;
    const eventType = window.prompt(
      "Tür: speeding, harsh_braking, harsh_acceleration, long_idle veya manual",
      "manual",
    );
    if (
      !eventType ||
      ![
        "speeding",
        "harsh_braking",
        "harsh_acceleration",
        "long_idle",
        "manual",
      ].includes(eventType)
    ) {
      setError("Geçerli bir güvenlik olayı türü seçin.");
      return;
    }
    const severity = window.prompt(
      "Önem: low, medium, high veya critical",
      "medium",
    );
    if (
      !severity ||
      !["low", "medium", "high", "critical"].includes(severity)
    ) {
      setError("Geçerli bir önem seviyesi seçin.");
      return;
    }
    const notes = window.prompt("Olay açıklaması (opsiyonel)") || null;
    try {
      await api.createSafetyEvent({
        assignmentId,
        eventType: eventType as
          | "speeding"
          | "harsh_braking"
          | "harsh_acceleration"
          | "long_idle"
          | "manual",
        severity: severity as "low" | "medium" | "high" | "critical",
        occurredAt: new Date().toISOString(),
        latitude: null,
        longitude: null,
        value: null,
        notes,
      });
      await refresh();
    } catch {
      setError("Güvenlik olayı kaydedilemedi; atama ID'sini kontrol edin.");
    }
  }
  async function addInspection() {
    const assignmentId = window.prompt("Kontrol yapılacak aktif atama ID'si");
    if (!assignmentId) return;
    const inspectionType = window.prompt(
      "Kontrol türü: pre_shift veya post_shift",
      "pre_shift",
    );
    if (
      !inspectionType ||
      !["pre_shift", "post_shift"].includes(inspectionType)
    ) {
      setError("Geçerli kontrol türü seçin.");
      return;
    }
    const safeToOperate = window.confirm(
      "Araç güvenli şekilde kullanılabilir mi? Tamam=Evet, İptal=Hayır",
    );
    const item = safeToOperate
      ? window.prompt("Varsa küçük kusur kalemi (boş bırakılabilir)")
      : window.prompt("Kusurlu kontrol kalemi (ör. Fren)");
    const defects = item
      ? [
          {
            item,
            severity: (safeToOperate ? "minor" : "critical") as
              | "minor"
              | "critical",
            description:
              window.prompt("Kusur açıklaması") ||
              "Kontrolde kusur tespit edildi",
          },
        ]
      : [];
    try {
      await api.createInspection({
        assignmentId,
        inspectionType: inspectionType as "pre_shift" | "post_shift",
        odometerKm: null,
        safeToOperate,
        notes: null,
        defects,
      });
      await refresh();
    } catch {
      setError(
        "Araç kontrolü kaydedilemedi; aktif atamayı ve kusur bilgilerini kontrol edin.",
      );
    }
  }
  async function addTireSet() {
    const brand = window.prompt("Lastik markası");
    if (!brand) return;
    const model = window.prompt("Lastik modeli");
    if (!model) return;
    const size = window.prompt("Ebat (ör. 215/65 R16)");
    if (!size) return;
    const serialNumber = window.prompt("Seri/lot numarası (opsiyonel)") || null;
    const targetText =
      window.prompt("Hedef kullanım kilometresi (opsiyonel)", "50000") || "";
    const targetChangeDate =
      window.prompt("Hedef değişim tarihi (YYYY-AA-GG, opsiyonel)") || null;
    try {
      await api.createTireSet({
        brand,
        model,
        size,
        serialNumber,
        purchasedOn: new Date().toISOString().slice(0, 10),
        initialOdometerKm: null,
        targetLifeKm: targetText ? Number(targetText) : null,
        targetChangeDate,
        notes: null,
      });
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "TIRE_SERIAL_EXISTS"
          ? "Bu seri numarası daha önce kaydedilmiş."
          : "Lastik seti kaydedilemedi; ebat ve hedef bilgilerini kontrol edin.",
      );
    }
  }
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <span>F</span> Filo
        </div>
        <nav>
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            ⌂ <b>Genel Bakış</b>
          </button>
          <button
            className={view === "vehicles" ? "active" : ""}
            onClick={() => setView("vehicles")}
          >
            ▣ Araçlar
          </button>
          <button
            className={view === "audit" ? "active" : ""}
            onClick={() => setView("audit")}
          >
            ✓ İşlem Geçmişi
          </button>
          <button
            className={view === "drivers" ? "active" : ""}
            onClick={() => setView("drivers")}
          >
            ♙ Sürücüler
          </button>
          <button
            className={view === "devices" ? "active" : ""}
            onClick={() => setView("devices")}
          >
            ▤ Cihazlar
          </button>
          <button
            className={view === "operations" ? "active" : ""}
            onClick={() => setView("operations")}
          >
            ↔ Operasyonlar
          </button>
          <button
            className={view === "geofences" ? "active" : ""}
            onClick={() => setView("geofences")}
          >
            ◎ Bölgeler
          </button>
          <button
            className={view === "alerts" ? "active" : ""}
            onClick={() => setView("alerts")}
          >
            ⚠ Uyarılar{" "}
            {alerts.filter((a) => a.status === "open").length
              ? `(${alerts.filter((a) => a.status === "open").length})`
              : ""}
          </button>
          <button
            className={view === "maintenance" ? "active" : ""}
            onClick={() => setView("maintenance")}
          >
            ⚙ Bakım{" "}
            {maintenance.filter((p) => p.displayStatus === "overdue").length
              ? `(${maintenance.filter((p) => p.displayStatus === "overdue").length})`
              : ""}
          </button>
          <button
            className={view === "expenses" ? "active" : ""}
            onClick={() => setView("expenses")}
          >
            ₺ Yakıt ve Giderler
          </button>
          <button
            className={view === "documents" ? "active" : ""}
            onClick={() => setView("documents")}
          >
            ▧ Belgeler{" "}
            {documents.filter((d) => d.displayStatus === "expired").length
              ? `(${documents.filter((d) => d.displayStatus === "expired").length})`
              : ""}
          </button>
          <button
            className={view === "safety" ? "active" : ""}
            onClick={() => setView("safety")}
          >
            ◉ Sürücü Güvenliği{" "}
            {safetySummary.open ? `(${safetySummary.open})` : ""}
          </button>
          <button
            className={view === "inspections" ? "active" : ""}
            onClick={() => setView("inspections")}
          >
            ☑ Araç Kontrolleri{" "}
            {inspectionSummary.openDefects
              ? `(${inspectionSummary.openDefects})`
              : ""}
          </button>
          <button
            className={view === "tires" ? "active" : ""}
            onClick={() => setView("tires")}
          >
            ◉ Lastikler {tireSummary.overdue ? `(${tireSummary.overdue})` : ""}
          </button>
          <button
            className={view === "incidents" ? "active" : ""}
            onClick={() => setView("incidents")}
          >
            ⚑ Kaza ve Hasar{" "}
            {incidentSummary.open ? `(${incidentSummary.open})` : ""}
          </button>
          <button
            className={view === "reports" ? "active" : ""}
            onClick={async () => {
              setView("reports");
              try {
                setReport(await api.report(reportFrom, reportTo));
              } catch {
                setError("Rapor oluşturulamadı; tarih aralığını kontrol edin.");
              }
            }}
          >
            ▥ Raporlar
          </button>
          <button
            className={view === "actions" ? "active" : ""}
            onClick={() => setView("actions")}
          >
            ◆ Aksiyon Merkezi{" "}
            {actions.filter(
              (a) => a.status === "open" || a.status === "in_progress",
            ).length
              ? `(${actions.filter((a) => a.status === "open" || a.status === "in_progress").length})`
              : ""}
          </button>
          <button
            className={view === "notifications" ? "active" : ""}
            onClick={() => setView("notifications")}
          >
            ● Bildirimler{" "}
            {notifications.filter((n) => !n.readAt).length
              ? `(${notifications.filter((n) => !n.readAt).length})`
              : ""}
          </button>
          {user.role !== "viewer" && (
            <button
              className={view === "mobile" ? "active" : ""}
              onClick={() => setView("mobile")}
            >
              ⌖ Telefon Takibi
            </button>
          )}
          {["owner", "admin"].includes(user.role) && (
            <button
              className={view === "members" ? "active" : ""}
              onClick={() => setView("members")}
            >
              ♟ Kullanıcılar
            </button>
          )}
          <button
            className={view === "security" ? "active" : ""}
            onClick={() => setView("security")}
          >
            ◈ Hesap Güvenliği
          </button>
        </nav>
        <div className="aside-foot">
          <small>AKTİF TENANT</small>
          <strong>{user.tenantName}</strong>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <div>
            <p className="eyebrow">OPERASYON KONTROL MERKEZİ</p>
            <h1>Günaydın, {user.fullName.split(" ")[0]}</h1>
          </div>
          <div className="user">
            <span>{user.fullName.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{user.fullName}</strong>
              <small>{user.role}</small>
            </div>
            <button className="secondary" onClick={onLogout}>
              Çıkış
            </button>
          </div>
        </header>
        {error && (
          <p className="error page-error" role="alert">
            {error}
          </p>
        )}
        {view === "overview" && (
          <>
            <section className="hero">
              <div>
                <p>FİLO DURUMU</p>
                <h2>
                  {vehicles.length
                    ? `${active} araç operasyona hazır`
                    : "İlk aracınızı filoya ekleyin"}
                </h2>
                <span>Tenant izolasyonlu araç ana kaydı aktif.</span>
              </div>
              <button onClick={() => setOpen(true)}>＋ Yeni araç ekle</button>
            </section>
            <section className="metrics">
              <article>
                <span>Toplam araç</span>
                <strong>{vehicles.length}</strong>
                <small>filo envanteri</small>
              </article>
              <article>
                <span>Aktif</span>
                <strong>{active}</strong>
                <small>operasyona hazır</small>
              </article>
              <article>
                <span>Bakımda</span>
                <strong>
                  {vehicles.filter((v) => v.status === "maintenance").length}
                </strong>
                <small>servis bekliyor</small>
              </article>
              <article>
                <span>Tenant</span>
                <strong>1</strong>
                <small>RLS korumalı</small>
              </article>
            </section>
          </>
        )}
        {(view === "overview" || view === "vehicles") && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">ARAÇ ANA KAYITLARI</p>
                <h2>Filo envanteri</h2>
              </div>
              <div>
                <span>{vehicles.length} kayıt</span>
                {view === "vehicles" && (
                  <button onClick={() => setOpen(true)}>＋ Araç ekle</button>
                )}
              </div>
            </div>
            {vehicles.length === 0 ? (
              <div className="empty">
                <b>Henüz araç yok</b>
                <p>
                  İlk güvenli dikey dilimi tamamlamak için bir araç ekleyin.
                </p>
                <button onClick={() => setOpen(true)}>Araç ekle</button>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plaka</th>
                      <th>Araç</th>
                      <th>Yıl</th>
                      <th>Durum</th>
                      <th>Kayıt tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <b>{v.plate}</b>
                        </td>
                        <td>
                          {v.make} {v.model}
                        </td>
                        <td>{v.year}</td>
                        <td>
                          <select
                            className={`status-select ${v.status}`}
                            value={v.status}
                            onChange={(event) =>
                              void changeStatus(
                                v,
                                event.target.value as Vehicle["status"],
                              )
                            }
                          >
                            <option value="active">Aktif</option>
                            <option value="maintenance">Bakımda</option>
                            <option value="inactive">Pasif</option>
                          </select>
                        </td>
                        <td>
                          {new Date(v.createdAt).toLocaleDateString("tr-TR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {view === "audit" && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">DEĞİŞTİRİLEMEZ KAYIT</p>
                <h2>İşlem geçmişi</h2>
              </div>
              <span>{events.length} olay</span>
            </div>
            {events.length === 0 ? (
              <div className="empty">
                <b>Henüz işlem kaydı yok</b>
                <p>
                  Araç eklediğinizde veya durumunu değiştirdiğinizde burada
                  görünecek.
                </p>
              </div>
            ) : (
              <div className="audit-list">
                {events.map((event) => (
                  <article key={event.id}>
                    <span className="audit-icon">✓</span>
                    <div>
                      <b>
                        {event.action === "vehicle.created"
                          ? "Araç eklendi"
                          : "Araç durumu değiştirildi"}
                      </b>
                      <p>
                        {String(event.metadata.plate ?? "Araç")} ·{" "}
                        {event.actorName}
                      </p>
                    </div>
                    <time>
                      {new Date(event.createdAt).toLocaleString("tr-TR")}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {view === "drivers" && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">SÜRÜCÜ YÖNETİMİ</p>
                <h2>Sürücüler</h2>
              </div>
              {["owner", "admin"].includes(user.role) && (
                <button onClick={() => void addDriver()}>＋ Sürücü ekle</button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ad soyad</th>
                    <th>Telefon</th>
                    <th>Ehliyet</th>
                    <th>Durum</th>
                    <th>Kayıt ID</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.fullName}</b>
                      </td>
                      <td>{d.phone}</td>
                      <td>{d.licenseNumber ?? "—"}</td>
                      <td>{d.status === "active" ? "Aktif" : "Pasif"}</td>
                      <td>
                        <small>{d.id}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {view === "devices" && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">CİHAZ ENVANTERİ</p>
                <h2>Şirket ve kişisel cihazlar</h2>
              </div>
              {["owner", "admin"].includes(user.role) && (
                <button onClick={() => void addDevice()}>＋ Cihaz ekle</button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cihaz</th>
                    <th>Sahiplik</th>
                    <th>Platform</th>
                    <th>Sürücü</th>
                    <th>Tanımlayıcı</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.model}</b>
                      </td>
                      <td>
                        {d.ownership === "company" ? "Şirket" : "Kişisel"}
                      </td>
                      <td>{d.platform}</td>
                      <td>{d.driverName ?? "Atanmamış"}</td>
                      <td>{d.identifier ?? "Veri minimizasyonu"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {view === "members" && (
          <>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">ROL, YETKİ VE ERİŞİM</p>
                  <h2>Kullanıcılar</h2>
                </div>
                <button onClick={() => void inviteMember()}>＋ Kullanıcı davet et</button>
              </div>
              {invitationLink && (
                <div className="invite-link-banner">
                  <div><b>Davet bağlantısı hazır</b><small>Bağlantı yalnız bir kez gösterilir ve 7 gün geçerlidir.</small></div>
                  <input readOnly value={invitationLink} onFocus={(event) => event.currentTarget.select()} />
                  <button className="secondary" onClick={() => void navigator.clipboard?.writeText(invitationLink)}>Kopyala</button>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>İşlem</th></tr></thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.userId}>
                        <td><b>{m.fullName}</b></td>
                        <td>{m.email}</td>
                        <td>
                          {user.role === "owner" && m.role !== "owner" ? (
                            <select value={m.role} disabled={m.status === "disabled"} onChange={async (event) => {
                              await api.updateMemberRole(m.userId, event.target.value as "admin" | "operator" | "viewer");
                              await refresh();
                            }}>
                              <option value="admin">Admin</option>
                              <option value="operator">Operatör</option>
                              <option value="viewer">Görüntüleyici</option>
                            </select>
                          ) : m.role}
                        </td>
                        <td><span className={`status ${m.status === "disabled" ? "inactive" : ""}`}>{m.status === "active" ? "Aktif" : "Erişim kapalı"}</span></td>
                        <td>
                          {user.role === "owner" && m.role !== "owner" && (
                            <button className="secondary" onClick={() => void changeMemberAccess(m)}>
                              {m.status === "active" ? "Erişimi kapat" : "Erişimi aç"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="table-card spaced">
              <div className="section-head"><div><p className="eyebrow">DAVET YAŞAM DÖNGÜSÜ</p><h2>Bekleyen ve geçmiş davetler</h2></div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>E-posta</th><th>Rol</th><th>Durum</th><th>Geçerlilik</th><th>İşlem</th></tr></thead>
                  <tbody>
                    {memberInvitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td><b>{invitation.email}</b></td>
                        <td>{invitation.role}</td>
                        <td>{invitation.status === "pending" ? "Bekliyor" : invitation.status === "accepted" ? "Kabul edildi" : invitation.status === "expired" ? "Süresi doldu" : "İptal edildi"}</td>
                        <td>{new Date(invitation.expiresAt).toLocaleString("tr-TR")}</td>
                        <td>{invitation.status === "pending" && <button className="secondary" onClick={() => void revokeInvitation(invitation.id)}>İptal et</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!memberInvitations.length && <div className="empty"><b>Henüz davet yok</b><p>Yeni kullanıcı davetleri burada izlenecek.</p></div>}
            </section>
          </>
        )}
        {view === "security" && <AccountSecurityPanel />}
        {view === "operations" && (
          <>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">ARAÇ–SÜRÜCÜ ATAMASI</p>
                  <h2>Aktif ve geçmiş atamalar</h2>
                </div>
                {user.role !== "viewer" && (
                  <button onClick={() => void addAssignment()}>
                    ＋ Atama oluştur
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Araç</th>
                      <th>Sürücü</th>
                      <th>Cihaz</th>
                      <th>Başlangıç</th>
                      <th>Durum / işlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <b>{a.vehiclePlate}</b>
                          <br />
                          <small>{a.vehicleId}</small>
                        </td>
                        <td>
                          {a.driverName}
                          <br />
                          <small>{a.driverId}</small>
                        </td>
                        <td>
                          {a.deviceModel ?? "Atanmamış"}
                          <br />
                          <small>{a.deviceId}</small>
                        </td>
                        <td>{new Date(a.startsAt).toLocaleString("tr-TR")}</td>
                        <td>
                          {a.endedAt ? (
                            "Tamamlandı"
                          ) : user.role === "viewer" ? (
                            "Aktif"
                          ) : (
                            <button
                              onClick={async () => {
                                await api.endAssignment(a.id);
                                await refresh();
                              }}
                            >
                              Atamayı bitir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">VARDİYA / ÇALIŞMA OTURUMU</p>
                  <h2>Vardiyalar</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Araç</th>
                      <th>Sürücü</th>
                      <th>Başlangıç</th>
                      <th>Durum</th>
                      <th>Rota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        <td>{s.vehiclePlate}</td>
                        <td>{s.driverName}</td>
                        <td>{new Date(s.startedAt).toLocaleString("tr-TR")}</td>
                        <td>
                          {s.status === "active" && user.role !== "viewer" ? (
                            <button
                              onClick={async () => {
                                await api.endShift(s.id);
                                await refresh();
                              }}
                            >
                              Vardiyayı bitir
                            </button>
                          ) : (
                            "Tamamlandı"
                          )}
                        </td>
                        <td>
                          <button
                            className="secondary"
                            onClick={async () =>
                              setSelectedRoute(
                                (await api.shiftRoute(s.id)).route,
                              )
                            }
                          >
                            Geçmişi aç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {user.role !== "viewer" &&
                assignments
                  .filter((a) => !a.endedAt)
                  .map((a) => (
                    <button
                      className="inline-action"
                      key={a.id}
                      onClick={async () => {
                        await api.startShift(a.id);
                        await refresh();
                      }}
                    >
                      Vardiya başlat: {a.vehiclePlate} / {a.driverName}
                    </button>
                  ))}
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">KONUM İZNİ VE TAKİP</p>
                  <h2>Takip durumları</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Atama</th>
                      <th>İzin</th>
                      <th>Takip</th>
                      <th>Güncelleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracking.map((t) => (
                      <tr key={t.assignmentId}>
                        <td>
                          <small>{t.assignmentId}</small>
                        </td>
                        <td>{t.permission}</td>
                        <td>{t.state}</td>
                        <td>
                          {user.role !== "viewer" && (
                            <>
                              <button
                                onClick={async () => {
                                  await api.updateTracking(
                                    t.assignmentId,
                                    "granted_always",
                                    "tracking",
                                  );
                                  await refresh();
                                }}
                              >
                                İzin ver / başlat
                              </button>
                              <button
                                className="secondary"
                                onClick={async () => {
                                  await api.updateTracking(
                                    t.assignmentId,
                                    "denied",
                                    "off",
                                  );
                                  await refresh();
                                }}
                              >
                                İzni geri çek
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {view === "mobile" && (
          <>
            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">UZAKTAN PİLOT GÜVENLİĞİ</p>
                  <h2>Firma mobil takip politikası</h2>
                </div>
                <span className="status">{mobilePilotPolicy.trackingEnabled ? "Takip açık" : "Acil durdurma aktif"}</span>
              </div>
              <p>
                Acil durdurma tüm cihazların bir sonraki heartbeat’te takibi kapatmasını sağlar.
                Minimum sürümün altındaki uygulamalar yeni vardiya veya konum gönderimi başlatamaz.
              </p>
              <div className="form-grid">
                <label>
                  Minimum mobil sürüm
                  <input
                    value={minimumMobileVersion}
                    onChange={(event) => setMinimumMobileVersion(event.target.value)}
                    placeholder="0.94.0"
                    pattern="[0-9]+\.[0-9]+\.[0-9]+"
                    disabled={!['owner', 'admin'].includes(user.role)}
                  />
                </label>
                <label>
                  Heartbeat aralığı
                  <select
                    value={mobilePilotPolicy.heartbeatIntervalSeconds}
                    onChange={(event) => setMobilePilotPolicy((current) => ({
                      ...current,
                      heartbeatIntervalSeconds: Number(event.target.value),
                    }))}
                    disabled={!['owner', 'admin'].includes(user.role)}
                  >
                    <option value={30}>30 saniye</option>
                    <option value={60}>60 saniye</option>
                    <option value={120}>2 dakika</option>
                    <option value={300}>5 dakika</option>
                  </select>
                </label>
              </div>
              {['owner', 'admin'].includes(user.role) && <div className="modal-actions">
                <button onClick={() => void saveMobilePilotPolicy()}>Politikayı kaydet</button>
                {mobilePilotPolicy.trackingEnabled
                  ? <button className="danger" onClick={() => void saveMobilePilotPolicy(false)}>Tüm mobil takibi acil durdur</button>
                  : <button className="secondary" onClick={() => void saveMobilePilotPolicy(true)}>Mobil takibi yeniden aç</button>}
              </div>}
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">V1.0 CANLIYA GEÇİŞ KAPISI</p>
                  <h2>{MOBILE_RELEASE_TARGET} GO / NO-GO merkezi</h2>
                </div>
                <span className="status">{currentLaunchReview?.status === "go"
                  ? "GO onaylandı"
                  : currentLaunchReview?.status === "no_go"
                    ? "NO-GO"
                    : launchReadinessAssessment.ready && launchEvidenceReady
                      ? "Karara hazır"
                      : "Kanıt bekleniyor"}</span>
              </div>
              <p>
                Fiziksel pilot onayı, tamamlanmış %100 rollout ve kapatılmış yayın olayları
                otomatik doğrulanır. Hukuk, geri yükleme, worker, izleme, destek ve rollback
                kanıtlarının tamamı geçmeden owner GO kararı veremez.
              </p>
              <div className="stats-grid">
                {launchReadinessAssessment.checks.map((check) => <article key={check.key}>
                  <small>{check.key === "pilot_approval" ? "PİLOT ONAYI" : check.key === "completed_rollout" ? "%100 ROLLOUT" : "AKTİF OLAY"}</small>
                  <strong>{check.passed ? "GEÇTİ" : "BEKLİYOR"}</strong>
                </article>)}
                <article><small>OPERASYONEL KANIT</small><strong>{currentLaunchReview?.evidence.filter((item) => item.status === "passed").length ?? 0}/6</strong></article>
              </div>
              {launchReadinessAssessment.checks.some((check) => !check.passed) && <div className="pilot-missing">
                <strong>Otomatik kapı eksikleri</strong>
                <span>{launchReadinessAssessment.checks.filter((check) => !check.passed).map((check) => check.detail).join(" · ")}</span>
              </div>}
              {!draftLaunchReview && currentLaunchReview?.status !== "go" && user.role === "owner" && <div className="modal-actions">
                <button onClick={() => void createLaunchReadinessReview()}>{currentLaunchReview ? "Yeni inceleme aç" : "Canlıya geçiş incelemesini aç"}</button>
              </div>}
              {currentLaunchReview && <>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Operasyonel kapı</th><th>Durum</th><th>Kanıt notu</th><th>İşlem</th></tr></thead>
                    <tbody>
                      {currentLaunchReview.evidence.map((evidence) => <tr key={evidence.type}>
                        <td>{launchEvidenceLabels[evidence.type]}</td>
                        <td>{evidence.status === "passed" ? "Geçti" : "Bekliyor"}</td>
                        <td>{evidence.notes ?? "Kanıt girilmedi"}<small>{evidence.updatedAt ? new Date(evidence.updatedAt).toLocaleString("tr-TR") : ""}</small></td>
                        <td>{currentLaunchReview.status === "draft" && ["owner", "admin"].includes(user.role) && <button
                          className={evidence.status === "passed" ? "secondary" : undefined}
                          onClick={() => void updateLaunchEvidence(currentLaunchReview, evidence.type)}
                        >{evidence.status === "passed" ? "Yeniden aç" : "Kanıtla"}</button>}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
                {currentLaunchReview.status === "draft" && user.role === "owner" && <div className="modal-actions">
                  <button
                    disabled={!launchReadinessAssessment.ready || !launchEvidenceReady}
                    onClick={() => void decideLaunchReadiness(currentLaunchReview, "go")}
                  >GO kararı ver</button>
                  <button className="danger" onClick={() => void decideLaunchReadiness(currentLaunchReview, "no_go")}>NO-GO kararı ver</button>
                </div>}
                {currentLaunchReview.status !== "draft" && <div className="approval-banner">
                  <strong>{currentLaunchReview.status === "go" ? "GO" : "NO-GO"} · değiştirilemez karar</strong>
                  <span>{currentLaunchReview.decidedAt ? new Date(currentLaunchReview.decidedAt).toLocaleString("tr-TR") : ""} · {currentLaunchReview.decisionNotes}</span>
                </div>}
              </>}
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">KONTROLLÜ MOBİL DAĞITIM</p>
                  <h2>{MOBILE_RELEASE_TARGET} kademeli rollout</h2>
                </div>
                <span className="status">{currentMobileRollout
                  ? `${currentMobileRollout.status} · %${currentMobileRollout.targetPercentage}`
                  : "Plan bekleniyor"}</span>
              </div>
              <p>
                Üretim onayından sonra cihazlar kararlı bir hash sırasıyla %10, %25, %50 ve %100
                gruplarına açılır. Her büyütme hedef sürüm heartbeat’i ve sağlık eşiğiyle engellenebilir;
                zamanlayıcı ihlalde otomatik duraklatır ve üç ardışık ihlalde önceki kararlı
                sürüme geri alır. Owner her müdahaleyi ayrıca yönetebilir.
              </p>
              {!currentMobileRollout && user.role === "owner" && <div className="modal-actions">
                <button disabled={!activeMobileReleaseApproval} onClick={() => void createMobileReleaseRollout()}>
                  Rollout planı oluştur
                </button>
              </div>}
              {currentMobileRollout && <>
                <div className="stats-grid">
                  <article><small>HEDEF GRUP</small><strong>%{currentMobileRollout.targetPercentage}</strong></article>
                  <article><small>UYGUN CİHAZ</small><strong>{currentMobileRollout.health.eligibleDeviceCount}</strong></article>
                  <article><small>HEDEF SÜRÜM</small><strong>{currentMobileRollout.health.observedTargetDevices}</strong></article>
                  <article><small>SAĞLIKSIZ</small><strong>%{currentMobileRollout.health.unhealthyPercent}</strong></article>
                  <article><small>ARDIŞIK İHLAL</small><strong>{currentMobileRollout.consecutiveBreaches}/{currentMobileRollout.rollbackAfterBreaches}</strong></article>
                </div>
                <div className="approval-banner">
                  <strong>Otomatik koruma: {currentMobileRollout.guardMode === "auto_rollback" ? "Duraklat + geri al" : currentMobileRollout.guardMode === "auto_pause" ? "Duraklat" : "Yalnız uyar"}</strong>
                  <span>Son değerlendirme: {currentMobileRollout.lastGuardAt ? new Date(currentMobileRollout.lastGuardAt).toLocaleString("tr-TR") : "Henüz çalışmadı"}</span>
                </div>
                {currentMobileRollout.health.missing.length > 0 && <div className="pilot-missing">
                  <strong>Aşama sağlık kapısı</strong>
                  <span>{currentMobileRollout.health.missing.join(" · ")}</span>
                </div>}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Cihaz</th><th>Grup</th><th>Sürüm</th><th>Sağlık</th></tr></thead>
                    <tbody>
                      {currentMobileRollout.devices.length === 0 && <tr><td colSpan={4}>Aktif mobil cihaz bulunamadı.</td></tr>}
                      {currentMobileRollout.devices.map((device) => <tr key={device.credentialId}>
                        <td>{device.deviceName}<small>{device.deviceManufacturer} {device.deviceModel} · {device.platform}</small></td>
                        <td>{device.eligible ? `Seçili · #${device.rolloutBucket}` : `Bekliyor · #${device.rolloutBucket}`}</td>
                        <td>{device.appVersion ?? "Heartbeat yok"}</td>
                        <td>{mobileHealthLabels[device.health]}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
                {user.role === "owner" && <div className="modal-actions">
                  {currentMobileRollout.status === "draft" && <button onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "start")}>%10 rollout’u başlat</button>}
                  {currentMobileRollout.status === "active" && currentMobileRollout.targetPercentage < 100 && <button disabled={!currentMobileRollout.health.readyToAdvance} onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "advance")}>Sonraki gruba ilerlet</button>}
                  {currentMobileRollout.status === "active" && currentMobileRollout.targetPercentage === 100 && <button disabled={!currentMobileRollout.health.readyToAdvance} onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "complete")}>Rollout’u tamamla</button>}
                  {currentMobileRollout.status === "active" && <button className="secondary" onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "pause")}>Dağıtımı duraklat</button>}
                  {currentMobileRollout.status === "paused" && <button onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "resume")}>Dağıtıma devam et</button>}
                  {["active", "paused", "completed"].includes(currentMobileRollout.status) && <button className="danger" onClick={() => void actOnMobileReleaseRollout(currentMobileRollout, "rollback")}>{MOBILE_PREVIOUS_STABLE} sürümüne geri al</button>}
                </div>}
                {currentMobileRollout.events[0] && <div className="approval-banner">
                  <strong>Son karar: {currentMobileRollout.events[0].action}</strong>
                  <span>{new Date(currentMobileRollout.events[0].createdAt).toLocaleString("tr-TR")} · {currentMobileRollout.events[0].reason}</span>
                </div>}
              </>}
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">YAYIN OLAY YÖNETİMİ</p>
                  <h2>Otomatik koruma olayları</h2>
                </div>
                <span className="status">{mobileReleaseIncidents.filter((incident) => incident.status !== "resolved").length} aktif</span>
              </div>
              <p>
                Sağlık eşiği ihlalleri tek olay üzerinde birleştirilir. Owner olayı kabul eder,
                kök neden ve saha doğrulaması tamamlandıktan sonra çözüm notuyla kapatır.
              </p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Sürüm</th><th>Önem</th><th>Durum</th><th>Tekrar</th><th>Sağlık kanıtı</th><th>İşlem</th></tr></thead>
                  <tbody>
                    {mobileReleaseIncidents.length === 0 && <tr><td colSpan={6}>Henüz rollout sağlık olayı yok.</td></tr>}
                    {mobileReleaseIncidents.map((incident) => <tr key={incident.id}>
                      <td>{incident.targetVersion}<small>{new Date(incident.lastObservedAt).toLocaleString("tr-TR")}</small></td>
                      <td><span className="status">{incident.severity === "critical" ? "Kritik" : "Uyarı"}</span></td>
                      <td>{incident.status === "open" ? "Açık" : incident.status === "acknowledged" ? "İnceleniyor" : "Çözüldü"}</td>
                      <td>{incident.occurrenceCount}</td>
                      <td>%{incident.healthSnapshot.unhealthyPercent} sağlıksız<small>{incident.healthSnapshot.missing.join(" · ") || "Eşik içinde"}</small></td>
                      <td><div className="table-actions">
                        {user.role === "owner" && incident.status === "open" && <button className="secondary" onClick={() => void updateMobileReleaseIncident(incident, "acknowledged")}>Kabul et</button>}
                        {user.role === "owner" && incident.status !== "resolved" && <button onClick={() => void updateMobileReleaseIncident(incident, "resolved")}>Çözüldü</button>}
                      </div></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">ÇOKLU CİHAZ ÜRETİM KAPISI</p>
                  <h2>{MOBILE_RELEASE_TARGET} pilot grubu</h2>
                </div>
                <span className="status">{activeMobileReleaseApproval ? "Üretim onaylı" : mobilePilotCohort.ready ? "Onaya hazır" : "Pilot eksik"}</span>
              </div>
              <p>
                Üretim onayı için aynı sürümde 6/6 kanıtla geçmiş en az bir iPhone ve
                iki farklı Android/OEM modeli gerekir. Onay, cihaz matrisinin değiştirilemez
                anlık görüntüsünü saklar.
              </p>
              <div className="stats-grid">
                <article><small>IPHONE</small><strong>{mobilePilotCohort.iosPassed}/{mobilePilotCohort.requiredIos}</strong></article>
                <article><small>ANDROID</small><strong>{mobilePilotCohort.androidPassed}/{mobilePilotCohort.requiredAndroid}</strong></article>
                <article><small>FARKLI ANDROID/OEM</small><strong>{mobilePilotCohort.distinctAndroidModels}/{mobilePilotCohort.requiredDistinctAndroidModels}</strong></article>
              </div>
              {mobilePilotCohort.missing.length > 0 && <div className="pilot-missing">
                <strong>Eksik pilot matrisi</strong>
                <span>{mobilePilotCohort.missing.join(" · ")}</span>
              </div>}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Platform</th><th>Üretici / model</th><th>Sürüm</th><th>Pilot tamamlandı</th></tr></thead>
                  <tbody>
                    {mobilePilotCohort.devices.length === 0 && <tr><td colSpan={4}>Bu sürüm için geçmiş fiziksel cihaz pilotu yok.</td></tr>}
                    {mobilePilotCohort.devices.map((device) => <tr key={device.runId}>
                      <td>{device.platform === "ios" ? "iPhone" : "Android"}</td>
                      <td>{device.deviceManufacturer}<small>{device.deviceModel}</small></td>
                      <td>{device.appVersion}</td>
                      <td>{new Date(device.completedAt).toLocaleString("tr-TR")}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              {user.role === "owner" && <div className="modal-actions">
                {!activeMobileReleaseApproval
                  ? <button disabled={!mobilePilotCohort.ready} onClick={() => void approveMobilePilotRelease()}>Üretim için onayla</button>
                  : <>
                    <button className="secondary" onClick={() => window.open(api.mobilePilotReleaseReportUrl(activeMobileReleaseApproval.id), "_blank", "noopener,noreferrer")}>Onay CSV’si</button>
                    <button className="danger" onClick={() => void revokeMobilePilotRelease(activeMobileReleaseApproval)}>Onayı geri çek</button>
                  </>}
              </div>}
              {activeMobileReleaseApproval && <div className="approval-banner">
                <strong>{activeMobileReleaseApproval.targetVersion} onaylandı</strong>
                <span>{new Date(activeMobileReleaseApproval.approvedAt).toLocaleString("tr-TR")} · {activeMobileReleaseApproval.notes}</span>
              </div>}
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">FİZİKSEL CİHAZ YAYIN KAPISI</p>
                  <h2>Pilot kanıtı ve karar kaydı</h2>
                </div>
                <span className="status">6 zorunlu kanıt</span>
              </div>
              <p>
                Arka plan izni, canlı heartbeat, arka plan konumu, çevrimdışı kuyruk,
                bağlantı sonrası eşitleme ve uzaktan komut kanıtı sunucu tarafından otomatik toplanır.
                Eksik kanıtla “Geçti” kararı verilemez.
              </p>
              <div className="stats-grid">
                <article><small>AKTİF PİLOT</small><strong>{mobilePilotRuns.filter((run) => run.status === "running").length}</strong></article>
                <article><small>GEÇEN</small><strong>{mobilePilotRuns.filter((run) => run.status === "passed").length}</strong></article>
                <article><small>KANITI TAM</small><strong>{mobilePilotRuns.filter((run) => run.readiness.ready).length}</strong></article>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Araç / cihaz</th><th>Durum</th><th>Kanıt</th><th>Eksik</th><th>Başlangıç</th><th>İşlem</th></tr></thead>
                  <tbody>
                    {mobilePilotRuns.length === 0 && <tr><td colSpan={6}>Henüz fiziksel cihaz pilotu başlatılmadı.</td></tr>}
                    {mobilePilotRuns.map((run) => <tr key={run.id}>
                      <td>{run.vehiclePlate}<small>{run.driverName} · {run.deviceName} · {run.deviceManufacturer} {run.deviceModel} · {run.platform}</small></td>
                      <td><span className="status">{run.status === "running" ? "Devam ediyor" : run.status === "passed" ? "Geçti" : run.status === "failed" ? "Kaldı" : "İptal"}</span></td>
                      <td><strong>{run.readiness.passedCount}/{run.readiness.requiredCount}</strong><small>{run.evidence.map((item) => mobilePilotEvidenceLabels[item.type]).join(" · ") || "Kanıt bekleniyor"}</small></td>
                      <td>{run.readiness.missing.length === 0 ? "Yok" : run.readiness.missing.map((type) => mobilePilotEvidenceLabels[type]).join(", ")}</td>
                      <td>{new Date(run.startedAt).toLocaleString("tr-TR")}</td>
                      <td><div className="table-actions">
                        <button className="secondary" onClick={() => window.open(api.mobilePilotReportUrl(run.id), "_blank", "noopener,noreferrer")}>CSV</button>
                        {run.status === "running" && ['owner', 'admin'].includes(user.role) && <>
                          <button disabled={!run.readiness.ready} onClick={() => void decideMobilePilotRun(run, "passed")}>Geçti</button>
                          <button className="danger" onClick={() => void decideMobilePilotRun(run, "failed")}>Kaldı</button>
                          <button className="secondary" onClick={() => void decideMobilePilotRun(run, "cancelled")}>İptal</button>
                        </>}
                      </div></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head"><div><p className="eyebrow">KOMUT KANITI</p><h2>Son uzaktan cihaz komutları</h2></div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cihaz</th><th>Komut</th><th>Neden</th><th>Durum</th><th>Zaman</th></tr></thead>
                  <tbody>
                    {mobileDeviceCommands.length === 0 && <tr><td colSpan={5}>Henüz uzaktan komut gönderilmedi.</td></tr>}
                    {mobileDeviceCommands.slice(0, 20).map((command) => {
                      const device = mobileDeviceStatuses.find((item) => item.credentialId === command.credentialId);
                      return <tr key={command.id}>
                        <td>{device?.vehiclePlate ?? command.credentialId}<small>{device?.deviceName ?? "Kayıtlı cihaz"}</small></td>
                        <td>{command.type === "pause_tracking" ? "Takibi durdur" : command.type === "resume_tracking" ? "Takibi yeniden aç" : "Şimdi eşitle"}</td>
                        <td>{command.reason}</td>
                        <td><span className="status">{command.status}</span>{command.resultCode && <small>{command.resultCode}</small>}</td>
                        <td>{new Date(command.createdAt).toLocaleString("tr-TR")}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">MOBİL PİLOT GÖZLEMİ</p>
                  <h2>Saha cihaz sağlığı</h2>
                </div>
                <button className="secondary" onClick={() => void refresh()}>Yenile</button>
              </div>
              <p>
                Cihaz heartbeat’i 10 dakikayı aşarsa çevrimdışı, bekleyen en eski konum
                5 dakikayı aşarsa kuyruk gecikiyor olarak işaretlenir.
              </p>
              <div className="stats-grid">
                <article><small>AKTİF CİHAZ</small><strong>{mobileDeviceStatuses.length}</strong></article>
                <article><small>SAĞLIKLI</small><strong>{mobileDeviceStatuses.filter((device) => device.health === "healthy").length}</strong></article>
                <article><small>MÜDAHALE</small><strong>{mobileDeviceStatuses.filter((device) => !["healthy", "idle"].includes(device.health)).length}</strong></article>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Araç / sürücü</th><th>Cihaz</th><th>Sağlık</th><th>Bağlantı / pil</th><th>Kuyruk</th><th>Son sinyal</th><th>Komut</th></tr></thead>
                  <tbody>
                    {mobileDeviceStatuses.length === 0 && <tr><td colSpan={7}>Aktif kayıtlı saha cihazı bulunmuyor.</td></tr>}
                    {mobileDeviceStatuses.map((device) => <tr key={device.credentialId}>
                      <td>{device.vehiclePlate}<small>{device.driverName}</small></td>
                      <td>{device.deviceName}<small>{device.platform} · {device.appVersion ?? "sürüm bekleniyor"}</small></td>
                      <td><span className="status">{mobileHealthLabels[device.health]}</span>{device.lastErrorCode && <small>{device.lastErrorCode}</small>}</td>
                      <td>{device.networkType ?? "—"} · {device.batteryPercent === null ? "—" : `%${device.batteryPercent}`}{device.lowPowerMode && <small>Düşük güç modu</small>}</td>
                      <td>{device.pendingLocationCount}<small>{device.oldestQueuedAt ? `En eski: ${new Date(device.oldestQueuedAt).toLocaleTimeString("tr-TR")}` : "Bekleyen yok"}</small></td>
                      <td>{device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString("tr-TR") : "Henüz yok"}<small>{device.lastLocationAt ? `Konum: ${new Date(device.lastLocationAt).toLocaleTimeString("tr-TR")}` : "Konum bekleniyor"}</small></td>
                      <td><div className="table-actions">
                        {!mobilePilotRuns.some((run) => run.credentialId === device.credentialId && run.status === "running") && <button onClick={() => void startMobilePilotRun(device.credentialId)}>Pilot</button>}
                        <button className="secondary" onClick={() => void sendMobileDeviceCommand(device.credentialId, "sync_now")}>Eşitle</button>
                        {device.pilotTrackingAllowed
                          ? <button className="danger" onClick={() => void sendMobileDeviceCommand(device.credentialId, "pause_tracking")}>Durdur</button>
                          : <button onClick={() => void sendMobileDeviceCommand(device.credentialId, "resume_tracking")}>Yeniden aç</button>}
                      </div><small>{device.pilotControlReason ?? `${mobileDeviceCommands.filter((command) => command.credentialId === device.credentialId && command.status === "pending").length} bekleyen`}</small></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card mobile-tracking">
              <div className="section-head">
                <div>
                  <p className="eyebrow">YEREL SÜRÜCÜ UYGULAMASI</p>
                  <h2>Güvenli telefon kaydı</h2>
                </div>
              </div>
              <p>
                Atama için 15 dakika geçerli, tek kullanımlık kayıt kodu üretin.
                Kod kullanıldığında önceki telefon erişimi otomatik iptal edilir.
              </p>
              <label>
                Aktif atama
                <select value={mobileAssignment} onChange={(event) => setMobileAssignment(event.target.value)}>
                  <option value="">Atama seçin</option>
                  {assignments.filter((assignment) => !assignment.endedAt).map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.vehiclePlate} · {assignment.driverName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button onClick={() => void createNativeMobileEnrollment()}>Kayıt kodu oluştur</button>
              </div>
              {mobileEnrollmentToken && <div className="invite-link-banner">
                <div><strong>Tek kullanımlık kod</strong><small>15 dakika içinde sürücü uygulamasına girilmelidir.</small></div>
                <input readOnly value={mobileEnrollmentToken} />
                <button className="secondary" onClick={() => void navigator.clipboard.writeText(mobileEnrollmentToken)}>Kopyala</button>
              </div>}
              <div className="security-note">{mobileMessage}</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Atama</th><th>Etiket</th><th>Durum</th><th>Geçerlilik</th><th></th></tr></thead>
                  <tbody>
                    {mobileEnrollments.map((enrollment) => {
                      const status = enrollment.revokedAt ? "İptal" : enrollment.claimedAt ? "Kullanıldı" : new Date(enrollment.expiresAt) <= new Date() ? "Süresi doldu" : "Bekliyor";
                      return <tr key={enrollment.id}>
                        <td>{enrollment.vehiclePlate}<small>{enrollment.driverName}</small></td>
                        <td>{enrollment.label}</td><td><span className="status">{status}</span></td>
                        <td>{new Date(enrollment.expiresAt).toLocaleString("tr-TR")}</td>
                        <td>{!enrollment.revokedAt && <button className="secondary" onClick={() => void revokeNativeMobileEnrollment(enrollment.id)}>İptal et</button>}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="table-card mobile-tracking spaced">
              <div className="section-head"><div><p className="eyebrow">GEÇİCİ TARAYICI TESTİ</p><h2>Mobil web konum testi</h2></div></div>
              <p>Bu kontrol yalnız ekran açıkken test içindir; gerçek pilotta yerel sürücü uygulamasını kullanın.</p>
              <div className="modal-actions">
                <button onClick={() => void startMobileTracking()}>Tarayıcı testini başlat</button>
                <button className="secondary" onClick={() => void stopMobileTracking()}>Tarayıcı testini durdur</button>
              </div>
            </section>
          </>
        )}
        {view === "geofences" && (
          <>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">GEOFENCE YÖNETİMİ</p>
                  <h2>Operasyon bölgeleri</h2>
                </div>
                {["owner", "admin"].includes(user.role) && (
                  <button onClick={() => void addGeofence()}>
                    ＋ Bölge ekle
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bölge</th>
                      <th>Merkez</th>
                      <th>Yarıçap</th>
                      <th>Durum / işlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geofences.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <b>{g.name}</b>
                        </td>
                        <td>
                          {g.latitude.toFixed(5)}, {g.longitude.toFixed(5)}
                        </td>
                        <td>{g.radiusMeters} m</td>
                        <td>
                          {g.status === "inactive" ? (
                            "Pasif"
                          ) : ["owner", "admin"].includes(user.role) ? (
                            <button
                              className="secondary"
                              onClick={async () => {
                                await api.deactivateGeofence(g.id);
                                await refresh();
                              }}
                            >
                              Pasife al
                            </button>
                          ) : (
                            "Aktif"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!geofences.length && (
                <div className="empty">
                  <b>Henüz bölge yok</b>
                  <p>
                    Depo, şube veya müşteri sahası için güvenli bir dairesel
                    bölge tanımlayın.
                  </p>
                </div>
              )}
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">GİRİŞ / ÇIKIŞ OLAYLARI</p>
                  <h2>Son bölge hareketleri</h2>
                </div>
                <span>{geofenceEvents.length} olay</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Bölge</th>
                      <th>Araç</th>
                      <th>Sürücü</th>
                      <th>Olay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geofenceEvents.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {new Date(e.occurredAt).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          <b>{e.geofenceName}</b>
                        </td>
                        <td>{e.vehiclePlate}</td>
                        <td>{e.driverName}</td>
                        <td>{e.eventType === "entered" ? "Giriş" : "Çıkış"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!geofenceEvents.length && (
                <div className="empty">
                  <b>Henüz giriş/çıkış olayı yok</b>
                  <p>
                    Aktif takipteki araç bir bölge sınırını geçtiğinde otomatik
                    oluşur.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "alerts" && (
          <>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">UYARI KURALLARI</p>
                  <h2>Operasyon kuralları</h2>
                </div>
                {["owner", "admin"].includes(user.role) && (
                  <button onClick={() => void addAlertRule()}>
                    ＋ Kural ekle
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kural</th>
                      <th>Tür</th>
                      <th>Hedef / eşik</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <b>{rule.name}</b>
                        </td>
                        <td>{rule.type}</td>
                        <td>
                          {rule.thresholdKph
                            ? `${rule.thresholdKph} km/sa`
                            : rule.geofenceId}
                        </td>
                        <td>{rule.status === "active" ? "Aktif" : "Pasif"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!alertRules.length && (
                <div className="empty">
                  <b>Henüz uyarı kuralı yok</b>
                  <p>Hız veya bölge geçişi için ilk kuralı oluşturun.</p>
                </div>
              )}
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">MÜDAHALE MERKEZİ</p>
                  <h2>Operasyon uyarıları</h2>
                </div>
                <span>
                  {alerts.filter((a) => a.status === "open").length} açık
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Kural</th>
                      <th>Araç / sürücü</th>
                      <th>Durum</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>
                          {new Date(alert.occurredAt).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          <b>{alert.ruleName}</b>
                          <br />
                          <small>{alert.type}</small>
                        </td>
                        <td>
                          {alert.vehiclePlate}
                          <br />
                          <small>{alert.driverName}</small>
                        </td>
                        <td>
                          {alert.status === "open"
                            ? "Açık"
                            : alert.status === "acknowledged"
                              ? "Görüldü"
                              : "Çözüldü"}
                        </td>
                        <td>
                          {alert.status !== "resolved" &&
                            user.role !== "viewer" && (
                              <>
                                {alert.status === "open" && (
                                  <button
                                    className="secondary"
                                    onClick={async () => {
                                      await api.updateAlertStatus(
                                        alert.id,
                                        "acknowledged",
                                      );
                                      await refresh();
                                    }}
                                  >
                                    Görüldü
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    await api.updateAlertStatus(
                                      alert.id,
                                      "resolved",
                                    );
                                    await refresh();
                                  }}
                                >
                                  Çöz
                                </button>
                              </>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!alerts.length && (
                <div className="empty">
                  <b>Henüz operasyon uyarısı yok</b>
                  <p>Aktif bir kural eşleştiğinde burada görünecek.</p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "maintenance" && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">ARAÇ BAKIM YÖNETİMİ</p>
                <h2>Bakım planları</h2>
              </div>
              {user.role !== "viewer" && (
                <button onClick={() => void addMaintenance()}>
                  ＋ Bakım planla
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Araç</th>
                    <th>Bakım</th>
                    <th>Hedef tarih</th>
                    <th>Hedef km</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <b>{plan.vehiclePlate}</b>
                      </td>
                      <td>{plan.title}</td>
                      <td>
                        {plan.dueDate
                          ? new Date(
                              `${plan.dueDate}T00:00:00`,
                            ).toLocaleDateString("tr-TR")
                          : "—"}
                      </td>
                      <td>
                        {plan.dueOdometerKm?.toLocaleString("tr-TR") ?? "—"}
                      </td>
                      <td>
                        {plan.displayStatus === "overdue"
                          ? "Gecikmiş"
                          : plan.displayStatus === "due_soon"
                            ? "Yaklaşıyor"
                            : plan.status === "completed"
                              ? "Tamamlandı"
                              : "Planlandı"}
                      </td>
                      <td>
                        {plan.status === "scheduled" &&
                          user.role !== "viewer" && (
                            <button
                              onClick={async () => {
                                const value = window.prompt(
                                  "Tamamlanma kilometresi (opsiyonel)",
                                );
                                await api.completeMaintenance(
                                  plan.id,
                                  value ? Number(value) : null,
                                );
                                await refresh();
                              }}
                            >
                              Tamamla
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!maintenance.length && (
              <div className="empty">
                <b>Henüz bakım planı yok</b>
                <p>
                  Araç için tarih veya kilometre hedefli ilk bakım planını
                  oluşturun.
                </p>
              </div>
            )}
          </section>
        )}
        {view === "expenses" && (
          <>
            <section className="metrics">
              <article>
                <span>Toplam gider</span>
                <strong>
                  {expenseSummary.totalAmount.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                  })}
                </strong>
                <small>{expenseSummary.entryCount} kayıt</small>
              </article>
              <article>
                <span>Yakıt gideri</span>
                <strong>
                  {expenseSummary.fuelAmount.toLocaleString("tr-TR", {
                    style: "currency",
                    currency: "TRY",
                  })}
                </strong>
                <small>yakıt harcaması</small>
              </article>
              <article>
                <span>Yakıt miktarı</span>
                <strong>
                  {expenseSummary.fuelLiters.toLocaleString("tr-TR")} L
                </strong>
                <small>toplam dolum</small>
              </article>
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">ARAÇ MALİYET TAKİBİ</p>
                  <h2>Yakıt ve operasyon giderleri</h2>
                </div>
                {user.role !== "viewer" && (
                  <button onClick={() => void addExpense()}>
                    ＋ Gider ekle
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Araç</th>
                      <th>Tür</th>
                      <th>Tutar</th>
                      <th>Litre</th>
                      <th>Kilometre</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>
                          {new Date(
                            `${expense.occurredOn}T00:00:00`,
                          ).toLocaleDateString("tr-TR")}
                        </td>
                        <td>
                          <b>{expense.vehiclePlate}</b>
                        </td>
                        <td>
                          {expense.category === "fuel"
                            ? "Yakıt"
                            : expense.category}
                        </td>
                        <td>
                          {expense.amount.toLocaleString("tr-TR", {
                            style: "currency",
                            currency: "TRY",
                          })}
                        </td>
                        <td>
                          {expense.liters === null
                            ? "—"
                            : `${expense.liters.toLocaleString("tr-TR")} L`}
                        </td>
                        <td>
                          {expense.odometerKm?.toLocaleString("tr-TR") ?? "—"}
                        </td>
                        <td>{expense.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!expenses.length && (
                <div className="empty">
                  <b>Henüz gider kaydı yok</b>
                  <p>İlk yakıt dolumunu veya araç giderini kaydedin.</p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "documents" && (
          <section className="table-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">ARAÇ BELGE VE UYUM TAKİBİ</p>
                <h2>Sigorta, muayene ve ruhsat kayıtları</h2>
              </div>
              {user.role !== "viewer" && (
                <button onClick={() => void addDocument()}>
                  ＋ Belge ekle
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Araç</th>
                    <th>Belge</th>
                    <th>Numara</th>
                    <th>Başlangıç</th>
                    <th>Bitiş</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <b>{document.vehiclePlate}</b>
                      </td>
                      <td>
                        {document.documentType === "traffic_insurance"
                          ? "Trafik sigortası"
                          : document.documentType === "casco"
                            ? "Kasko"
                            : document.documentType === "inspection"
                              ? "Muayene"
                              : document.documentType === "registration"
                                ? "Ruhsat"
                                : "Diğer"}
                      </td>
                      <td>{document.documentNumber ?? "—"}</td>
                      <td>
                        {document.validFrom
                          ? new Date(
                              `${document.validFrom}T00:00:00`,
                            ).toLocaleDateString("tr-TR")
                          : "—"}
                      </td>
                      <td>
                        {document.expiresOn
                          ? new Date(
                              `${document.expiresOn}T00:00:00`,
                            ).toLocaleDateString("tr-TR")
                          : "Süresiz"}
                      </td>
                      <td>
                        {document.displayStatus === "expired"
                          ? "Süresi doldu"
                          : document.displayStatus === "expiring_soon"
                            ? `Yaklaşıyor (${document.daysUntilExpiry} gün)`
                            : document.displayStatus === "valid"
                              ? "Geçerli"
                              : document.status === "renewed"
                                ? "Yenilendi"
                                : "İptal"}
                      </td>
                      <td>
                        {document.status === "active" &&
                          ["owner", "admin"].includes(user.role) && (
                            <>
                              <button
                                onClick={async () => {
                                  await api.updateDocumentStatus(
                                    document.id,
                                    "renewed",
                                  );
                                  await refresh();
                                }}
                              >
                                Yenilendi
                              </button>
                              <button
                                className="secondary"
                                onClick={async () => {
                                  await api.updateDocumentStatus(
                                    document.id,
                                    "cancelled",
                                  );
                                  await refresh();
                                }}
                              >
                                İptal
                              </button>
                            </>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!documents.length && (
              <div className="empty">
                <b>Henüz araç belgesi yok</b>
                <p>
                  İlk trafik sigortası, muayene veya ruhsat kaydını ekleyin.
                </p>
              </div>
            )}
          </section>
        )}
        {view === "safety" && (
          <>
            <section className="metrics">
              <article>
                <span>Toplam olay</span>
                <strong>{safetySummary.total}</strong>
                <small>güvenlik kaydı</small>
              </article>
              <article>
                <span>Açık olay</span>
                <strong>{safetySummary.open}</strong>
                <small>inceleme bekliyor</small>
              </article>
              <article>
                <span>Ciddi olay</span>
                <strong>{safetySummary.serious}</strong>
                <small>yüksek / kritik</small>
              </article>
              <article>
                <span>Etkilenen atama</span>
                <strong>{safetySummary.assignmentCount}</strong>
                <small>araç-sürücü eşleşmesi</small>
              </article>
            </section>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">SÜRÜCÜ GÜVENLİĞİ</p>
                  <h2>İhlal ve güvenlik olayları</h2>
                </div>
                {user.role !== "viewer" && (
                  <button onClick={() => void addSafetyEvent()}>
                    ＋ Olay ekle
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Araç / sürücü</th>
                      <th>Olay</th>
                      <th>Önem</th>
                      <th>Durum</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safetyEvents.map((event) => (
                      <tr key={event.id}>
                        <td>
                          {new Date(event.occurredAt).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          <b>{event.vehiclePlate}</b>
                          <br />
                          <small>{event.driverName}</small>
                        </td>
                        <td>
                          {event.eventType}
                          <br />
                          <small>{event.notes ?? "—"}</small>
                        </td>
                        <td>{event.severity}</td>
                        <td>
                          {event.status === "open"
                            ? "Açık"
                            : event.status === "reviewed"
                              ? "İncelendi"
                              : "Çözüldü"}
                        </td>
                        <td>
                          {event.status !== "resolved" &&
                            user.role !== "viewer" && (
                              <>
                                {event.status === "open" && (
                                  <button
                                    className="secondary"
                                    onClick={async () => {
                                      await api.updateSafetyEventStatus(
                                        event.id,
                                        "reviewed",
                                      );
                                      await refresh();
                                    }}
                                  >
                                    İncelendi
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    await api.updateSafetyEventStatus(
                                      event.id,
                                      "resolved",
                                    );
                                    await refresh();
                                  }}
                                >
                                  Çöz
                                </button>
                              </>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!safetyEvents.length && (
                <div className="empty">
                  <b>Henüz güvenlik olayı yok</b>
                  <p>
                    Hız, sert sürüş, uzun rölanti veya manuel olayları burada
                    takip edin.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "inspections" && (
          <>
            <section className="metrics">
              <article>
                <span>Toplam kontrol</span>
                <strong>{inspectionSummary.total}</strong>
                <small>vardiya kontrolleri</small>
              </article>
              <article>
                <span>Güvensiz araç</span>
                <strong>{inspectionSummary.unsafe}</strong>
                <small>kullanıma uygun değil</small>
              </article>
              <article>
                <span>Açık kusur</span>
                <strong>{inspectionSummary.openDefects}</strong>
                <small>müdahale bekliyor</small>
              </article>
              <article>
                <span>Kritik kusur</span>
                <strong>{inspectionSummary.criticalDefects}</strong>
                <small>yüksek öncelik</small>
              </article>
            </section>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">VARDİYA ARAÇ KONTROLÜ</p>
                  <h2>Kontroller ve açık kusurlar</h2>
                </div>
                {user.role !== "viewer" && (
                  <button onClick={() => void addInspection()}>
                    ＋ Kontrol kaydet
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Araç / sürücü</th>
                      <th>Tür</th>
                      <th>Uygunluk</th>
                      <th>Kusurlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((inspection) => (
                      <tr key={inspection.id}>
                        <td>
                          {new Date(inspection.inspectedAt).toLocaleString(
                            "tr-TR",
                          )}
                        </td>
                        <td>
                          <b>{inspection.vehiclePlate}</b>
                          <br />
                          <small>{inspection.driverName}</small>
                        </td>
                        <td>
                          {inspection.inspectionType === "pre_shift"
                            ? "Vardiya öncesi"
                            : "Vardiya sonrası"}
                        </td>
                        <td>
                          {inspection.safeToOperate
                            ? "Kullanılabilir"
                            : "Kullanılamaz"}
                        </td>
                        <td>
                          {inspection.defects.length
                            ? inspection.defects.map((defect) => (
                                <div key={defect.id}>
                                  <b>{defect.item}</b> · {defect.severity} ·{" "}
                                  {defect.status}
                                  {defect.status !== "resolved" &&
                                    user.role !== "viewer" && (
                                      <button
                                        className="secondary"
                                        onClick={async () => {
                                          const notes =
                                            window.prompt("Çözüm notu");
                                          if (!notes) return;
                                          await api.updateInspectionDefectStatus(
                                            defect.id,
                                            "resolved",
                                            notes,
                                          );
                                          await refresh();
                                        }}
                                      >
                                        Çöz
                                      </button>
                                    )}
                                </div>
                              ))
                            : "Kusur yok"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!inspections.length && (
                <div className="empty">
                  <b>Henüz araç kontrolü yok</b>
                  <p>
                    Aktif atama için vardiya öncesi veya sonrası kontrol
                    kaydedin.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "tires" && (
          <>
            <section className="metrics">
              <article>
                <span>Toplam set</span>
                <strong>{tireSummary.total}</strong>
                <small>lastik envanteri</small>
              </article>
              <article>
                <span>Takılı</span>
                <strong>{tireSummary.mounted}</strong>
                <small>aktif kullanımda</small>
              </article>
              <article>
                <span>Değişim yaklaşıyor</span>
                <strong>{tireSummary.dueSoon}</strong>
                <small>30 gün / 2.000 km</small>
              </article>
              <article>
                <span>Gecikmiş</span>
                <strong>{tireSummary.overdue}</strong>
                <small>müdahale gerekli</small>
              </article>
            </section>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">LASTİK YAŞAM DÖNGÜSÜ</p>
                  <h2>Envanter, montaj ve değişim hedefleri</h2>
                </div>
                {user.role !== "viewer" && (
                  <button onClick={() => void addTireSet()}>
                    ＋ Lastik seti ekle
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lastik</th>
                      <th>Araç / konum</th>
                      <th>Takılma</th>
                      <th>Kullanım</th>
                      <th>Hedef</th>
                      <th>Durum</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tires.map((tire) => (
                      <tr key={tire.id}>
                        <td>
                          <b>
                            {tire.brand} {tire.model}
                          </b>
                          <br />
                          <small>
                            {tire.size}
                            {tire.serialNumber ? ` · ${tire.serialNumber}` : ""}
                          </small>
                        </td>
                        <td>
                          {tire.vehiclePlate ?? "Depoda"}
                          {tire.position ? ` · ${tire.position}` : ""}
                        </td>
                        <td>
                          {tire.mountedOn
                            ? new Date(
                                `${tire.mountedOn}T00:00:00`,
                              ).toLocaleDateString("tr-TR")
                            : "—"}
                          <br />
                          <small>
                            {tire.mountedOdometerKm?.toLocaleString("tr-TR") ??
                              "—"}{" "}
                            km
                          </small>
                        </td>
                        <td>
                          {tire.usedKm === null
                            ? "—"
                            : `${tire.usedKm.toLocaleString("tr-TR")} km`}
                        </td>
                        <td>
                          {tire.targetLifeKm
                            ? `${tire.targetLifeKm.toLocaleString("tr-TR")} km`
                            : "—"}
                          <br />
                          <small>{tire.targetChangeDate ?? "—"}</small>
                        </td>
                        <td>
                          {tire.displayStatus === "overdue"
                            ? "Gecikmiş"
                            : tire.displayStatus === "due_soon"
                              ? "Yaklaşıyor"
                              : tire.status === "mounted"
                                ? "Takılı"
                                : tire.status === "stored"
                                  ? "Depoda"
                                  : "Emekli"}
                        </td>
                        <td>
                          {user.role !== "viewer" &&
                            tire.status === "stored" && (
                              <button
                                onClick={async () => {
                                  const vehicleId = window.prompt("Araç ID");
                                  if (!vehicleId) return;
                                  const km = Number(
                                    window.prompt("Montaj kilometresi", "0"),
                                  );
                                  await api.mountTireSet(
                                    tire.id,
                                    vehicleId,
                                    "all",
                                    new Date().toISOString().slice(0, 10),
                                    km,
                                  );
                                  await refresh();
                                }}
                              >
                                Tak
                              </button>
                            )}
                          {user.role !== "viewer" &&
                            tire.status === "mounted" && (
                              <button
                                onClick={async () => {
                                  const km = Number(
                                    window.prompt("Söküm kilometresi"),
                                  );
                                  const reason = window.prompt("Söküm nedeni");
                                  if (!reason) return;
                                  await api.removeTireSet(
                                    tire.id,
                                    new Date().toISOString().slice(0, 10),
                                    km,
                                    reason,
                                  );
                                  await refresh();
                                }}
                              >
                                Sök
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!tires.length && (
                <div className="empty">
                  <b>Henüz lastik seti yok</b>
                  <p>
                    İlk lastik setini ekleyip araca monte ederek yaşam döngüsü
                    takibini başlatın.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "incidents" && (
          <>
            <section className="metrics">
              <article>
                <span>Toplam olay</span>
                <strong>{incidentSummary.total}</strong>
                <small>kaza ve hasar kaydı</small>
              </article>
              <article>
                <span>Açık dosya</span>
                <strong>{incidentSummary.open}</strong>
                <small>inceleme bekliyor</small>
              </article>
              <article>
                <span>Kritik</span>
                <strong>{incidentSummary.critical}</strong>
                <small>yüksek öncelik</small>
              </article>
              <article>
                <span>Tahmini risk</span>
                <strong>
                  {incidentSummary.estimatedExposure.toLocaleString("tr-TR")} ₺
                </strong>
                <small>açık dosyalar</small>
              </article>
            </section>
            <section className="table-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">KAZA VE HASAR YÖNETİMİ</p>
                  <h2>Olay ve sigorta dosyaları</h2>
                </div>
                {user.role !== "viewer" && (
                  <button
                    onClick={async () => {
                      const vehicleId = window.prompt("Araç ID");
                      if (!vehicleId) return;
                      const description = window.prompt("Olay açıklaması");
                      if (!description) return;
                      const estimatedText =
                        window.prompt("Tahmini maliyet (opsiyonel)") || "";
                      try {
                        await api.createIncident({
                          vehicleId,
                          driverId: null,
                          incidentType: "accident",
                          severity: "major",
                          occurredAt: new Date().toISOString(),
                          location: null,
                          description,
                          injuryReported: false,
                          policeReportNumber: null,
                          insuranceClaimNumber: null,
                          estimatedCost: estimatedText
                            ? Number(estimatedText)
                            : null,
                        });
                        await refresh();
                      } catch {
                        setError(
                          "Olay kaydedilemedi; araç ve olay bilgilerini kontrol edin.",
                        );
                      }
                    }}
                  >
                    ＋ Olay kaydet
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Araç / sürücü</th>
                      <th>Olay</th>
                      <th>Dosya</th>
                      <th>Maliyet</th>
                      <th>Durum</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => (
                      <tr key={incident.id}>
                        <td>
                          {new Date(incident.occurredAt).toLocaleString(
                            "tr-TR",
                          )}
                        </td>
                        <td>
                          <b>{incident.vehiclePlate}</b>
                          <br />
                          <small>
                            {incident.driverName ?? "Sürücü belirtilmedi"}
                          </small>
                        </td>
                        <td>
                          {incident.incidentType} · {incident.severity}
                          <br />
                          <small>{incident.description}</small>
                        </td>
                        <td>
                          {incident.insuranceClaimNumber ??
                            incident.policeReportNumber ??
                            "—"}
                        </td>
                        <td>
                          {(
                            incident.actualCost ?? incident.estimatedCost
                          )?.toLocaleString("tr-TR") ?? "—"}{" "}
                          ₺
                        </td>
                        <td>{incident.status}</td>
                        <td>
                          {user.role !== "viewer" &&
                            (incident.status === "open" ||
                              incident.status === "reviewing") && (
                              <button
                                onClick={async () => {
                                  const notes = window.prompt("Çözüm notu");
                                  if (!notes) return;
                                  const actualText =
                                    window.prompt(
                                      "Gerçek maliyet (opsiyonel)",
                                    ) || "";
                                  await api.updateIncident(
                                    incident.id,
                                    "resolved",
                                    notes,
                                    incident.insuranceClaimNumber,
                                    actualText ? Number(actualText) : null,
                                  );
                                  await refresh();
                                }}
                              >
                                Çöz
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!incidents.length && (
                <div className="empty">
                  <b>Henüz kaza veya hasar kaydı yok</b>
                  <p>
                    Operasyon olaylarını ve sigorta süreçlerini tek dosyada
                    takip edin.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {view === "reports" && (
          <>
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">FİLO PERFORMANS RAPORU</p>
                  <h2>Operasyon ve maliyet özeti</h2>
                </div>
                <div>
                  <input
                    type="date"
                    value={reportFrom}
                    onChange={(e) => setReportFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    value={reportTo}
                    onChange={(e) => setReportTo(e.target.value)}
                  />
                  <button
                    onClick={async () => {
                      try {
                        setReport(await api.report(reportFrom, reportTo));
                      } catch {
                        setError("Rapor tarih aralığı geçersiz.");
                      }
                    }}
                  >
                    Raporla
                  </button>
                  {user.role !== "viewer" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        window.open(
                          api.reportCsvUrl(reportFrom, reportTo),
                          "_blank",
                        )
                      }
                    >
                      CSV indir
                    </button>
                  )}
                </div>
              </div>
            </section>
            {report && (
              <>
                <section className="metrics">
                  <article>
                    <span>Araç</span>
                    <strong>{report.summary.vehicleCount}</strong>
                    <small>rapor kapsamı</small>
                  </article>
                  <article>
                    <span>Toplam gider</span>
                    <strong>
                      {report.summary.totalExpense.toLocaleString("tr-TR")} ₺
                    </strong>
                    <small>
                      {report.summary.fuelLiters.toLocaleString("tr-TR")} litre
                      yakıt
                    </small>
                  </article>
                  <article>
                    <span>Güvenlik / olay</span>
                    <strong>
                      {report.summary.safetyEvents} / {report.summary.incidents}
                    </strong>
                    <small>seçili tarih aralığı</small>
                  </article>
                  <article>
                    <span>Açık risk</span>
                    <strong>
                      {report.summary.overdueMaintenance +
                        report.summary.expiredDocuments +
                        report.summary.openDefects}
                    </strong>
                    <small>bakım, belge ve kusur</small>
                  </article>
                </section>
                <section className="table-card">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Araç</th>
                          <th>Km</th>
                          <th>Gider</th>
                          <th>Yakıt</th>
                          <th>Güvenlik</th>
                          <th>Olay</th>
                          <th>Bakım</th>
                          <th>Belge</th>
                          <th>Kusur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.vehicles.map((row) => (
                          <tr key={row.vehicleId}>
                            <td>
                              <b>{row.vehiclePlate}</b>
                            </td>
                            <td>{row.distanceKm.toLocaleString("tr-TR")}</td>
                            <td>
                              {row.totalExpense.toLocaleString("tr-TR")} ₺
                            </td>
                            <td>{row.fuelLiters.toLocaleString("tr-TR")} L</td>
                            <td>{row.safetyEvents}</td>
                            <td>{row.incidents}</td>
                            <td>{row.overdueMaintenance}</td>
                            <td>{row.expiredDocuments}</td>
                            <td>{row.openDefects}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
        {view === "actions" && (
          <section className="table-card spaced">
            <div className="section-head">
              <div>
                <p className="eyebrow">BİLDİRİM VE GÖREV YÖNETİMİ</p>
                <h2>Aksiyon Merkezi</h2>
              </div>
              {user.role !== "viewer" && (
                <div>
                  <button
                    className="secondary"
                    onClick={async () => {
                      await api.generateActions();
                      await refresh();
                    }}
                  >
                    Risklerden aksiyon üret
                  </button>
                  <button
                    onClick={async () => {
                      const title = window.prompt("Aksiyon başlığı");
                      if (!title) return;
                      await api.createAction({
                        title,
                        description: null,
                        priority: "medium",
                        vehicleId: null,
                        assignedUserId: null,
                        dueOn: null,
                      });
                      await refresh();
                    }}
                  >
                    ＋ Manuel aksiyon
                  </button>
                </div>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Öncelik</th>
                    <th>Aksiyon</th>
                    <th>Araç</th>
                    <th>Sorumlu</th>
                    <th>Son tarih</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr key={action.id}>
                      <td>
                        <b>{action.priority}</b>
                      </td>
                      <td>
                        {action.title}
                        <br />
                        <small>{action.sourceType}</small>
                      </td>
                      <td>{action.vehiclePlate ?? "—"}</td>
                      <td>{action.assignedUserName ?? "Atanmadı"}</td>
                      <td>{action.dueOn ?? "—"}</td>
                      <td>{action.status}</td>
                      <td>
                        {user.role !== "viewer" &&
                          action.status !== "completed" &&
                          action.status !== "cancelled" && (
                            <button
                              onClick={async () => {
                                await api.updateAction(
                                  action.id,
                                  "completed",
                                  action.assignedUserId,
                                  action.dueOn,
                                );
                                await refresh();
                              }}
                            >
                              Tamamla
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!actions.length && (
              <div className="empty">
                <b>Henüz aksiyon yok</b>
                <p>
                  Operasyon risklerinden yinelenmeyen görevler üretin veya
                  manuel aksiyon ekleyin.
                </p>
              </div>
            )}
          </section>
        )}
        {view === "notifications" && (
          <>
            {user.role !== "viewer" && (
              <ProviderIncidentsPanel
                incidents={notificationProviderIncidents}
                scanStatus={notificationProviderIncidentScanStatus}
                focusedId={focusedProviderIncidentId}
                onSync={async () => {
                  await api.syncNotificationProviderIncidents();
                  await refresh();
                }}
                onUpdate={async (id, status, notes) => {
                  await api.updateNotificationProviderIncident(
                    id,
                    status,
                    notes,
                  );
                  await refresh();
                }}
              />
            )}
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">UYGULAMA İÇİ BİLDİRİM KUTUSU</p>
                  <h2>Bildirimler</h2>
                </div>
                <div>
                  {notifications.some((item) => !item.readAt) && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        await api.markAllNotificationsRead();
                        await refresh();
                      }}
                    >
                      Tümünü okundu yap
                    </button>
                  )}
                  {user.role !== "viewer" && (
                    <button
                      onClick={async () => {
                        await api.generateNotifications();
                        await refresh();
                      }}
                    >
                      Bildirimleri üret
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Önem</th>
                      <th>Bildirim</th>
                      <th>Araç</th>
                      <th>Zaman</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <b>{item.severity}</b>
                        </td>
                        <td>
                          {item.title}
                          <br />
                          <small>{item.message}</small>
                          {item.actionTarget?.type === "provider_incident" && (
                            <>
                              <br />
                              <button
                                className="secondary action-link"
                                onClick={async () => {
                                  if (!item.readAt)
                                    await api.markNotificationRead(item.id);
                                  setFocusedProviderIncidentId(
                                    item.actionTarget!.id,
                                  );
                                  await refresh();
                                  setTimeout(
                                    () =>
                                      document
                                        .getElementById(
                                          `provider-incident-${item.actionTarget!.id}`,
                                        )
                                        ?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "center",
                                        }),
                                    0,
                                  );
                                }}
                              >
                                Olaya git
                              </button>
                            </>
                          )}
                        </td>
                        <td>{item.vehiclePlate ?? "—"}</td>
                        <td>
                          {new Date(item.createdAt).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          {item.readAt ? (
                            "Okundu"
                          ) : (
                            <button
                              onClick={async () => {
                                await api.markNotificationRead(item.id);
                                await refresh();
                              }}
                            >
                              Okundu işaretle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!notifications.length && (
                <div className="empty">
                  <b>Henüz bildirim yok</b>
                  <p>
                    Aktif kurallardan yinelenmeyen uygulama içi bildirimler
                    üretin.
                  </p>
                </div>
              )}
            </section>
            {user.role !== "viewer" && notificationRetention && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">SAKLAMA VE ARŞİV</p>
                    <h2>Okunmuş bildirim yaşam döngüsü</h2>
                    <small>
                      {notificationRetention.eligibleCount} kayıt uygun ·{" "}
                      {notificationRetention.settings.automaticArchiveEnabled
                        ? `Otomatik, ${notificationRetention.settings.archiveIntervalHours} saatte bir`
                        : `Otomasyon kapalı`}{" "}
                      · Kayıtlar silinmez
                    </small>
                  </div>
                  <div>
                    {["owner", "admin"].includes(user.role) && (
                      <>
                        <button
                          className="secondary"
                          onClick={async () => {
                            const raw = window.prompt(
                              "Okunmuş bildirim saklama süresi (30–730 gün)",
                              String(
                                notificationRetention.settings
                                  .readRetentionDays,
                              ),
                            );
                            if (!raw) return;
                            const days = Number(raw);
                            if (
                              !Number.isInteger(days) ||
                              days < 30 ||
                              days > 730
                            ) {
                              setError(
                                "Saklama süresi 30–730 gün arasında tam sayı olmalıdır.",
                              );
                              return;
                            }
                            await api.updateNotificationRetention({
                              ...notificationRetention.settings,
                              readRetentionDays: days,
                            });
                            await refresh();
                          }}
                        >
                          Süreyi değiştir
                        </button>
                        <button
                          className="secondary"
                          onClick={async () => {
                            await api.updateNotificationRetention({
                              ...notificationRetention.settings,
                              automaticArchiveEnabled:
                                !notificationRetention.settings
                                  .automaticArchiveEnabled,
                            });
                            await refresh();
                          }}
                        >
                          Otomasyon:{" "}
                          {notificationRetention.settings
                            .automaticArchiveEnabled
                            ? "Açık"
                            : "Kapalı"}
                        </button>
                        <button
                          className="secondary"
                          onClick={async () => {
                            await api.updateNotificationRetention({
                              ...notificationRetention.settings,
                              automaticReconciliationEnabled:
                                !notificationRetention.settings
                                  .automaticReconciliationEnabled,
                            });
                            await refresh();
                          }}
                        >
                          Uzlaştırma:{" "}
                          {notificationRetention.settings
                            .automaticReconciliationEnabled
                            ? "Açık"
                            : "Kapalı"}
                        </button>
                        <button
                          className="secondary"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                "Son temas süresini aşmış yarım kalan arşivleme denemeleri uzlaştırılsın mı? İşlem otomatik yeniden deneme başlatmaz.",
                              )
                            )
                              return;
                            await api.reconcileStaleNotificationArchives();
                            await refresh();
                          }}
                        >
                          Şimdi uzlaştır
                        </button>
                        <button
                          className="secondary"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                "Geciken açık uzlaştırma işleri için yinelenmeyen uygulama içi hatırlatmalar oluşturulsun mu? E-posta veya push gönderilmez.",
                              )
                            )
                              return;
                            await api.notifyOverdueArchiveReconciliations();
                            await refresh();
                          }}
                        >
                          Gecikenleri hatırlat
                        </button>
                      </>
                    )}
                    <button
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "En fazla batch limiti kadar uygun bildirim arşivlensin mi? Kayıtlar silinmeyecek.",
                          )
                        )
                          return;
                        await api.archiveEligibleNotifications();
                        await refresh();
                      }}
                    >
                      Uygun kayıtları arşivle
                    </button>
                  </div>
                </div>
                <p>
                  Saklama: {notificationRetention.settings.readRetentionDays}{" "}
                  gün · Batch: {notificationRetention.settings.archiveBatchSize}{" "}
                  · Son çalışma:{" "}
                  {notificationRetention.settings.lastArchiveAt
                    ? new Date(
                        notificationRetention.settings.lastArchiveAt,
                      ).toLocaleString("tr-TR")
                    : "—"}{" "}
                  · Sonraki:{" "}
                  {notificationRetention.settings.nextDueAt
                    ? new Date(
                        notificationRetention.settings.nextDueAt,
                      ).toLocaleString("tr-TR")
                    : "—"}
                </p>
                <p>
                  Yarım kalan deneme uzlaştırması:{" "}
                  {notificationRetention.settings
                    .automaticReconciliationEnabled
                    ? `${notificationRetention.settings.reconciliationIntervalMinutes} dakikada bir`
                    : "Kapalı"}{" "}
                  · Süre aşımı:{" "}
                  {
                    notificationRetention.settings
                      .reconciliationStaleAfterMinutes
                  }{" "}
                  dakika · Son çalışma:{" "}
                  {notificationRetention.settings.lastReconciliationAt
                    ? new Date(
                        notificationRetention.settings.lastReconciliationAt,
                      ).toLocaleString("tr-TR")
                    : "—"}{" "}
                  · Sonraki:{" "}
                  {notificationRetention.settings.nextReconciliationDueAt
                    ? new Date(
                        notificationRetention.settings
                          .nextReconciliationDueAt,
                      ).toLocaleString("tr-TR")
                    : "—"}
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Çalıştırma</th>
                        <th>Kaynak</th>
                        <th>Kesim zamanı</th>
                        <th>Limit</th>
                        <th>Arşivlenen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationRetention.recentRuns.map((run) => (
                        <tr key={run.id}>
                          <td>
                            {new Date(run.createdAt).toLocaleString("tr-TR")}
                          </td>
                          <td>
                            {run.source === "scheduler"
                              ? "Zamanlayıcı"
                              : "Manuel"}
                          </td>
                          <td>
                            {new Date(run.cutoffAt).toLocaleString("tr-TR")}
                          </td>
                          <td>{run.batchSize}</td>
                          <td>{run.archivedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!notificationRetention.recentRuns.length && (
                  <div className="empty">
                    <b>Henüz arşiv çalıştırması yok</b>
                    <p>
                      Süreyi dolduran okunmuş bildirimler ilk kontrollü
                      çalıştırmada arşivlenir.
                    </p>
                  </div>
                )}
                <div className="section-head">
                  <div>
                    <p className="eyebrow">ÇALIŞTIRMA DURUMU</p>
                    <h3>Son arşivleme denemeleri</h3>
                  </div>
                  <small>
                    Ham hata ayrıntısı yerine güvenli sonuç kodları gösterilir.
                  </small>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Başlangıç</th>
                        <th>Son temas</th>
                        <th>Kaynak</th>
                        <th>Durum</th>
                        <th>Sonuç kodu</th>
                        <th>Arşivlenen</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationRetention.recentAttempts.map((attempt) => (
                        <tr key={attempt.id}>
                          <td>
                            {new Date(attempt.startedAt).toLocaleString(
                              "tr-TR",
                            )}
                          </td>
                          <td>
                            {new Date(attempt.heartbeatAt).toLocaleString(
                              "tr-TR",
                            )}
                            {attempt.reconciledAt ? (
                              <>
                                <br />
                                <small>Uzlaştırıldı</small>
                              </>
                            ) : null}
                          </td>
                          <td>
                            {attempt.source === "scheduler"
                              ? "Zamanlayıcı"
                              : attempt.source === "retry"
                                ? `Yeniden deneme ${attempt.retryNumber}/3`
                                : "Manuel"}
                          </td>
                          <td>
                            {attempt.status === "succeeded"
                              ? "Başarılı"
                              : attempt.status === "failed"
                                ? "Başarısız"
                                : attempt.status === "skipped"
                                  ? "Atlandı"
                                  : "Çalışıyor"}
                          </td>
                          <td>{attempt.outcomeCode ?? "—"}</td>
                          <td>{attempt.archivedCount ?? "—"}</td>
                          <td>
                            {attempt.status === "failed" &&
                            attempt.retryNumber < 3 &&
                            ["owner", "admin"].includes(user.role) ? (
                              <button
                                className="secondary"
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      "Bu başarısız arşivleme denemesi kontrollü olarak yeniden çalıştırılsın mı?",
                                    )
                                  )
                                    return;
                                  await api.retryNotificationArchive(
                                    attempt.id,
                                  );
                                  await refresh();
                                }}
                              >
                                Yeniden dene
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!notificationRetention.recentAttempts.length && (
                  <div className="empty">
                    <b>Henüz çalıştırma denemesi yok</b>
                  </div>
                )}
                <div className="section-head">
                  <div>
                    <p className="eyebrow">UZLAŞTIRMA GEÇMİŞİ</p>
                    <h3>Yarım kalan deneme taramaları</h3>
                  </div>
                  <small>Uzlaştırma, yeniden denemeyi otomatik başlatmaz.</small>
                </div>
                <div className="reconciliation-toolbar">
                  <p>
                    Aktif: {notificationRetention.reconciliationSummary.active}
                    {" · "}Açık: {notificationRetention.reconciliationSummary.open}
                    {" · "}Ele alındı: {notificationRetention.reconciliationSummary.acknowledged}
                    {" · "}Geciken: {notificationRetention.reconciliationSummary.overdue}
                    {" · "}Atanmamış: {notificationRetention.reconciliationSummary.unassigned}
                    {" · "}Çözüldü: {notificationRetention.reconciliationSummary.resolved}
                  </p>
                  <label>
                    Görünüm
                    <select
                      value={reconciliationFilter}
                      onChange={(event) =>
                        setReconciliationFilter(
                          event.target.value as typeof reconciliationFilter,
                        )
                      }
                    >
                      <option value="active">Aktif işler</option>
                      <option value="overdue">Gecikenler</option>
                      <option value="unassigned">Atanmamışlar</option>
                      <option value="resolved">Çözülenler</option>
                      <option value="all">Tümü</option>
                    </select>
                  </label>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Çalıştırma</th>
                        <th>Kaynak</th>
                        <th>Süre aşımı</th>
                        <th>Uzlaştırılan</th>
                        <th>Uyarı</th>
                        <th>Durum</th>
                        <th>Hedef süre</th>
                        <th>Sorumlu</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReconciliations.map(
                        (reconciliation) => (
                          <tr key={reconciliation.id}>
                            <td>
                              {new Date(
                                reconciliation.createdAt,
                              ).toLocaleString("tr-TR")}
                            </td>
                            <td>
                              {reconciliation.source === "scheduler"
                                ? "Zamanlayıcı"
                                : "Manuel"}
                            </td>
                            <td>
                              {reconciliation.staleAfterMinutes} dakika
                            </td>
                            <td>{reconciliation.reconciledCount}</td>
                            <td>{reconciliation.notificationsCreated}</td>
                            <td>
                              {reconciliation.handlingStatus === "not_required"
                                ? "İşlem gerekmiyor"
                                : reconciliation.handlingStatus === "open"
                                  ? "Açık"
                                  : reconciliation.handlingStatus ===
                                      "acknowledged"
                                    ? "Ele alındı"
                                    : "Çözüldü"}
                              {reconciliation.isHandlingOverdue ? (
                                <>
                                  <br />
                                  <small className="overdue-label">Gecikti</small>
                                </>
                              ) : null}
                              {reconciliation.resolutionNotes ? (
                                <>
                                  <br />
                                  <small>{reconciliation.resolutionNotes}</small>
                                </>
                              ) : null}
                            </td>
                            <td>
                              {reconciliation.handlingDeadlineAt
                                ? new Date(
                                    reconciliation.handlingDeadlineAt,
                                  ).toLocaleString("tr-TR")
                                : "—"}
                            </td>
                            <td>
                              {reconciliation.assignedToName ?? "Atanmadı"}
                              {reconciliation.assignedToRole ? (
                                <>
                                  <br />
                                  <small>{reconciliation.assignedToRole}</small>
                                </>
                              ) : null}
                              {["owner", "admin"].includes(user.role) &&
                              ["open", "acknowledged"].includes(
                                reconciliation.handlingStatus,
                              ) ? (
                                <select
                                  value={reconciliation.assignedTo ?? ""}
                                  onChange={async (event) => {
                                    await api.assignArchiveReconciliation(
                                      reconciliation.id,
                                      event.target.value || null,
                                    );
                                    await refresh();
                                  }}
                                >
                                  <option value="">Atanmamış</option>
                                  {members
                                    .filter((member) =>
                                      ["owner", "admin", "operator"].includes(
                                        member.role,
                                      ),
                                    )
                                    .map((member) => (
                                      <option
                                        key={member.userId}
                                        value={member.userId}
                                      >
                                        {member.fullName}
                                      </option>
                                    ))}
                                </select>
                              ) : null}
                            </td>
                            <td>
                              {["owner", "admin"].includes(user.role) &&
                              reconciliation.handlingStatus === "open" ? (
                                <button
                                  className="secondary"
                                  onClick={async () => {
                                    await api.updateArchiveReconciliation(
                                      reconciliation.id,
                                      "acknowledged",
                                      null,
                                    );
                                    await refresh();
                                  }}
                                >
                                  Ele al
                                </button>
                              ) : null}
                              {["owner", "admin"].includes(user.role) &&
                              ["open", "acknowledged"].includes(
                                reconciliation.handlingStatus,
                              ) ? (
                                <button
                                  className="secondary"
                                  onClick={async () => {
                                    const notes = window.prompt(
                                      "Çözüm notu (zorunlu)",
                                    );
                                    if (!notes?.trim()) return;
                                    await api.updateArchiveReconciliation(
                                      reconciliation.id,
                                      "resolved",
                                      notes.trim(),
                                    );
                                    await refresh();
                                  }}
                                >
                                  Çöz
                                </button>
                              ) : null}
                              {!["owner", "admin"].includes(user.role) ||
                              !["open", "acknowledged"].includes(
                                reconciliation.handlingStatus,
                              )
                                ? "—"
                                : null}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                {!filteredReconciliations.length && (
                  <div className="empty">
                    <b>Bu görünümde uzlaştırma kaydı yok</b>
                  </div>
                )}
                <div className="section-head">
                  <div>
                    <p className="eyebrow">HATIRLATMA GEÇMİŞİ</p>
                    <h3>Gecikmiş iş taramaları</h3>
                  </div>
                  <small>Tarama geçmişi yeni işlem veya yeniden deneme başlatmaz.</small>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Başlangıç</th><th>Kaynak</th><th>Başlatan</th><th>Durum</th><th>Taranan</th><th>Oluşturulan uyarı</th><th>Tamamlanma</th></tr>
                    </thead>
                    <tbody>
                      {notificationRetention.recentReminderRuns.map((run) => (
                        <tr key={run.id}>
                          <td>{new Date(run.startedAt).toLocaleString("tr-TR")}</td>
                          <td>{run.source === "scheduler" ? "Zamanlayıcı" : "Manuel"}</td>
                          <td>{run.initiatedByName ?? "Sistem kullanıcısı"}</td>
                          <td>{run.status === "succeeded" ? "Başarılı" : run.status === "failed" ? `Başarısız · ${run.outcomeCode ?? "Bilinmeyen sonuç"}` : "Çalışıyor"}</td>
                          <td>{run.scannedCount}</td>
                          <td>{run.notificationsCreated}</td>
                          <td>{run.completedAt ? new Date(run.completedAt).toLocaleString("tr-TR") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!notificationRetention.recentReminderRuns.length && (
                  <div className="empty"><b>Henüz hatırlatma taraması yok</b></div>
                )}
                <div className="section-head">
                  <div>
                    <p className="eyebrow">BAKIM GEÇMİŞİ</p>
                    <h3>Yarım kalan tarama temizliği</h3>
                  </div>
                  <small>Aynı bakım anahtarı yalnız bir kez işlenir.</small>
                </div>
                <p>
                  Bakım sağlığı:{" "}
                  {notificationRetention.reminderMaintenanceHealth.status === "attention"
                    ? "Müdahale gerekli"
                    : notificationRetention.reminderMaintenanceHealth.status === "running"
                      ? "Tarama çalışıyor"
                      : "Sağlıklı"}
                  {" · "}Sebep:{" "}
                  {notificationRetention.reminderMaintenanceHealth.reason === "stale_runs"
                    ? "Süreyi aşan tarama var"
                    : notificationRetention.reminderMaintenanceHealth.reason === "maintenance_never_completed"
                      ? "Bakım henüz tamamlanmadı"
                      : notificationRetention.reminderMaintenanceHealth.reason === "maintenance_overdue"
                        ? "Bakım zamanında çalışmadı"
                        : notificationRetention.reminderMaintenanceHealth.reason === "active_scan"
                          ? "Tarama devam ediyor"
                          : "Bakım güncel"}
                  {" · "}Çalışan: {notificationRetention.reminderMaintenanceHealth.runningCount}
                  {" · "}Süreyi aşan: {notificationRetention.reminderMaintenanceHealth.staleRunningCount}
                  {" · "}En eski başlangıç:{" "}
                  {notificationRetention.reminderMaintenanceHealth.oldestRunningStartedAt
                    ? new Date(notificationRetention.reminderMaintenanceHealth.oldestRunningStartedAt).toLocaleString("tr-TR")
                    : "—"}
                  {" · "}Son bakım:{" "}
                  {notificationRetention.reminderMaintenanceHealth.lastCompletedAt
                    ? new Date(notificationRetention.reminderMaintenanceHealth.lastCompletedAt).toLocaleString("tr-TR")
                    : "—"}
                  {" · "}Güncellik sınırı: {notificationRetention.reminderMaintenanceHealth.freshnessThresholdMinutes} dakika
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Tamamlanma</th><th>Kaynak</th><th>Başlatan</th><th>Süre aşımı</th><th>Kapatılan</th><th>Sonuç</th></tr>
                    </thead>
                    <tbody>
                      {notificationRetention.recentReminderMaintenanceRuns.map((run) => (
                        <tr key={run.id}>
                          <td>{new Date(run.completedAt).toLocaleString("tr-TR")}</td>
                          <td>{run.source === "scheduler" ? "Zamanlayıcı" : "Manuel"}</td>
                          <td>{run.initiatedByName ?? "Sistem kullanıcısı"}</td>
                          <td>{run.staleAfterMinutes} dakika</td>
                          <td>{run.reconciledCount}</td>
                          <td>{run.outcomeCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!notificationRetention.recentReminderMaintenanceRuns.length && (
                  <div className="empty"><b>Henüz bakım çalışması yok</b></div>
                )}
              </section>
            )}
            {user.role !== "viewer" && notificationAnalytics && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">TESLİMAT ANALİTİĞİ</p>
                    <h2>Son {notificationAnalytics.rangeDays} gün</h2>
                  </div>
                </div>
                <p>
                  Toplam: {notificationAnalytics.summary.total} · Teslim:{" "}
                  {notificationAnalytics.summary.delivered} · Hatalı:{" "}
                  {notificationAnalytics.summary.failed} · Kuyruk:{" "}
                  {notificationAnalytics.summary.queued}
                </p>
              </section>
            )}
            {user.role !== "viewer" && notificationProviderHealth && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">SAĞLAYICI SAĞLIĞI</p>
                    <h2>Teslimat kanalları</h2>
                  </div>
                  <small>
                    {notificationProviderHealth.settings.lookbackHours} saatlik
                    görünüm
                  </small>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Sağlayıcı</th>
                        <th>Kanal</th>
                        <th>Durum</th>
                        <th>Başarısızlık</th>
                        <th>Kuyruk yaşı</th>
                        <th>Son teslim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationProviderHealth.providers.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <b>{item.name}</b>
                            <br />
                            <small>{item.provider}</small>
                          </td>
                          <td>{item.channel}</td>
                          <td>
                            {item.health === "healthy" ? "Sağlıklı" : "Uyarı"}
                          </td>
                          <td>%{item.failureRatePercent}</td>
                          <td>{item.oldestReadyAgeSeconds} sn</td>
                          <td>
                            {item.lastDeliveredAt
                              ? new Date(item.lastDeliveredAt).toLocaleString(
                                  "tr-TR",
                                )
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!notificationProviderHealth.providers.length && (
                  <div className="empty">
                    <b>Sağlayıcı profili yok</b>
                  </div>
                )}
              </section>
            )}
            <section className="table-card spaced">
              <div className="section-head">
                <div>
                  <p className="eyebrow">TESLİMAT TERCİHLERİ</p>
                  <h2>Kanallar ve sessiz saatler</h2>
                </div>
                <button
                  onClick={async () => {
                    await api.updateNotificationPreferences({
                      ...notificationPreferences,
                      emailEnabled: !notificationPreferences.emailEnabled,
                      updatedAt: undefined,
                    } as never);
                    await refresh();
                  }}
                >
                  E-posta:{" "}
                  {notificationPreferences.emailEnabled ? "Açık" : "Kapalı"}
                </button>
              </div>
              <p>
                Push: {notificationPreferences.pushEnabled ? "Açık" : "Kapalı"}{" "}
                · Saat dilimi: {notificationPreferences.timezone} · Sessiz saat:{" "}
                {notificationPreferences.quietHoursEnabled
                  ? `${notificationPreferences.quietStart}–${notificationPreferences.quietEnd}`
                  : "Kapalı"}
              </p>
            </section>
            {user.role !== "viewer" && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">SAĞLAYICI BAĞIMSIZ OUTBOX</p>
                    <h2>Bildirim teslimatları</h2>
                  </div>
                  <button
                    onClick={async () => {
                      await api.enqueueNotificationDeliveries();
                      await refresh();
                    }}
                  >
                    Teslimat kuyruğu üret
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bildirim</th>
                        <th>Alıcı</th>
                        <th>Kanal</th>
                        <th>Durum</th>
                        <th>Deneme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationDeliveries.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{item.recipientName}</td>
                          <td>{item.channel}</td>
                          <td>{item.status}</td>
                          <td>{item.attemptCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {["owner", "admin"].includes(user.role) && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">ÇOK DİLLİ İÇERİK</p>
                    <h2>Bildirim şablonları</h2>
                  </div>
                  <button
                    onClick={async () => {
                      const key = window.prompt(
                        "Şablon anahtarı (ör. notification.action)",
                      );
                      if (!key) return;
                      await api.createNotificationTemplate({
                        key,
                        channel: "email",
                        locale: "tr-TR",
                        subjectTemplate: "{{title}}",
                        bodyTemplate: "Merhaba {{recipientName}}, {{message}}",
                        requiredVariables: [
                          "title",
                          "recipientName",
                          "message",
                        ],
                      });
                      await refresh();
                    }}
                  >
                    ＋ Şablon ekle
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Anahtar</th>
                        <th>Kanal</th>
                        <th>Dil</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationTemplates.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <b>{item.key}</b>
                          </td>
                          <td>{item.channel}</td>
                          <td>{item.locale}</td>
                          <td>
                            <button
                              className="secondary"
                              onClick={async () => {
                                await api.updateNotificationTemplate(
                                  item.id,
                                  item.status === "active"
                                    ? "inactive"
                                    : "active",
                                );
                                await refresh();
                              }}
                            >
                              {item.status}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {["owner", "admin"].includes(user.role) && (
              <section className="table-card spaced">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">TENANT BİLDİRİM KURALLARI</p>
                    <h2>Kurallar</h2>
                  </div>
                  <button
                    onClick={async () => {
                      const name = window.prompt("Kural adı");
                      if (!name) return;
                      await api.createNotificationRule({
                        name,
                        sourceType: "action",
                        leadDays: 7,
                        severity: "warning",
                        targetRole: null,
                      });
                      await refresh();
                    }}
                  >
                    ＋ Kural ekle
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Kural</th>
                        <th>Kaynak</th>
                        <th>Ön süre</th>
                        <th>Önem</th>
                        <th>Hedef</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notificationRules.map((rule) => (
                        <tr key={rule.id}>
                          <td>
                            <b>{rule.name}</b>
                          </td>
                          <td>{rule.sourceType}</td>
                          <td>{rule.leadDays} gün</td>
                          <td>{rule.severity}</td>
                          <td>{rule.targetRole ?? "Tüm roller"}</td>
                          <td>
                            <button
                              className="secondary"
                              onClick={async () => {
                                await api.updateNotificationRule(
                                  rule.id,
                                  rule.status === "active"
                                    ? "inactive"
                                    : "active",
                                );
                                await refresh();
                              }}
                            >
                              {rule.status}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
        {view === "operations" && selectedRoute && (
          <section className="table-card spaced route-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">VARDİYA ROTA GEÇMİŞİ</p>
                <h2>
                  {selectedRoute.vehiclePlate} · {selectedRoute.driverName}
                </h2>
              </div>
              <button
                className="secondary"
                onClick={() => setSelectedRoute(null)}
              >
                Kapat
              </button>
            </div>
            <section className="route-metrics">
              <article>
                <span>Konum noktası</span>
                <strong>{selectedRoute.pointCount}</strong>
              </article>
              <article>
                <span>Tahmini mesafe</span>
                <strong>
                  {(selectedRoute.distanceMeters / 1000).toFixed(2)} km
                </strong>
              </article>
              <article>
                <span>Hareket</span>
                <strong>
                  {Math.round(selectedRoute.movingSeconds / 60)} dk
                </strong>
              </article>
              <article>
                <span>Duraklama</span>
                <strong>
                  {Math.round(selectedRoute.stoppedSeconds / 60)} dk
                </strong>
              </article>
            </section>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Zaman</th>
                    <th>Koordinat</th>
                    <th>Hız</th>
                    <th>Doğruluk</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRoute.points.map((point) => (
                    <tr key={point.id}>
                      <td>
                        {new Date(point.recordedAt).toLocaleString("tr-TR")}
                      </td>
                      <td>
                        {point.latitude.toFixed(5)},{" "}
                        {point.longitude.toFixed(5)}
                      </td>
                      <td>
                        {point.speedMps === null
                          ? "—"
                          : `${Math.round(point.speedMps * 3.6)} km/sa`}
                      </td>
                      <td>±{Math.round(point.accuracyMeters)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!selectedRoute.pointCount && (
              <div className="empty">
                <b>Bu vardiyada konum kaydı yok</b>
                <p>Takip başladığında zaman sıralı rota burada oluşur.</p>
              </div>
            )}
          </section>
        )}
        {view === "operations" && (
          <section className="table-card spaced">
            <div className="section-head">
              <div>
                <p className="eyebrow">CANLI OPERASYON GÖRÜNÜMÜ</p>
                <h2>Son alınan konumlar</h2>
              </div>
              <button className="secondary" onClick={() => void refresh()}>
                Yenile
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Araç</th>
                    <th>Sürücü</th>
                    <th>Koordinat</th>
                    <th>Doğruluk</th>
                    <th>Telefon zamanı</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.assignmentId}>
                      <td>
                        <b>{l.vehiclePlate}</b>
                      </td>
                      <td>{l.driverName}</td>
                      <td>
                        {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                      </td>
                      <td>±{Math.round(l.accuracyMeters)} m</td>
                      <td>{new Date(l.recordedAt).toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!locations.length && (
              <div className="empty">
                <b>Henüz konum kaydı yok</b>
                <p>
                  Aktif vardiyada telefon takibi başlatıldığında burada
                  görünecek.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
      {open && (
        <VehicleForm
          onClose={() => setOpen(false)}
          onCreated={(v) => {
            setVehicles([v, ...vehicles]);
            setOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loader">Filo hazırlanıyor…</div>;
  if (!user) {
    const invitationToken = invitationTokenFromUrl();
    const resetToken = passwordResetTokenFromUrl();
    if (resetToken) return <PasswordReset token={resetToken} />;
    return invitationToken
      ? <InviteAcceptance token={invitationToken} onLogin={setUser} />
      : <Login onLogin={setUser} />;
  }
  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
      }}
    />
  );
}
