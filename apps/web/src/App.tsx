import { useEffect, useState, type FormEvent } from "react";
import type { AuditEvent, CreateVehicleInput, Device, Driver, Member, SessionUser, Vehicle } from "@filo/contracts";
import { api } from "./api";

function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("admin@demo.filo");
  const [password, setPassword] = useState("FiloDemo123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onLogin((await api.login(email, password)).user); }
    catch { setError("E-posta veya parola hatalı."); }
    finally { setBusy(false); }
  }
  return <main className="login-shell">
    <section className="login-copy">
      <div className="brand"><span>F</span> Filo</div>
      <p className="eyebrow">OPERASYON KONTROL MERKEZİ</p>
      <h1>Filonuzdaki her araç, tek ve güvenli görünümde.</h1>
      <p>İlk dikey dilim; tenant izolasyonu, yönetici oturumu ve araç ana kaydını gerçek API üzerinden doğrular.</p>
      <div className="security-note">Tenant verileri PostgreSQL RLS ile birbirinden ayrılır.</div>
    </section>
    <form className="login-card" onSubmit={submit}>
      <p className="eyebrow">GÜVENLİ GİRİŞ</p><h2>Hesabınıza giriş yapın</h2>
      <label>E-posta<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
      <label>Parola<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      <small>Demo bilgileri geliştirme seed’i ile otomatik hazırlanır.</small>
    </form>
  </main>;
}

function VehicleForm({ onCreated, onClose }: { onCreated: (v: Vehicle) => void; onClose: () => void }) {
  const [form, setForm] = useState<CreateVehicleInput>({ plate: "", make: "", model: "", year: 2026, status: "active" });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { onCreated((await api.createVehicle(form)).vehicle); }
    catch (e) { setError(e instanceof Error && e.message === "PLATE_ALREADY_EXISTS" ? "Bu plaka zaten kayıtlı." : "Araç kaydedilemedi."); }
  }
  return <div className="modal-backdrop" role="presentation">
    <form className="modal" onSubmit={submit} aria-label="Yeni araç">
      <div className="modal-head"><div><p className="eyebrow">ARAÇ ANA KAYDI</p><h2>Yeni araç ekle</h2></div><button type="button" className="icon-btn" onClick={onClose}>×</button></div>
      <div className="form-grid">
        <label>Plaka<input required value={form.plate} onChange={(e) => setForm({...form, plate:e.target.value})} placeholder="34 ABC 123" /></label>
        <label>Marka<input required value={form.make} onChange={(e) => setForm({...form, make:e.target.value})} placeholder="Ford" /></label>
        <label>Model<input required value={form.model} onChange={(e) => setForm({...form, model:e.target.value})} placeholder="Transit" /></label>
        <label>Model yılı<input required type="number" value={form.year} onChange={(e) => setForm({...form, year:Number(e.target.value)})} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Vazgeç</button><button>Aracı kaydet</button></div>
    </form>
  </div>;
}

function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [view, setView] = useState<"overview" | "vehicles" | "drivers" | "devices" | "members" | "audit">("overview");
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const [vehicleResult, auditResult, driverResult, deviceResult] = await Promise.all([api.vehicles(), api.auditEvents(), api.drivers(), api.devices()]);
      setVehicles(vehicleResult.vehicles);
      setEvents(auditResult.events);
      setDrivers(driverResult.drivers); setDevices(deviceResult.devices);
      if (["owner","admin"].includes(user.role)) setMembers((await api.members()).members);
    } catch {
      setError("Veriler yüklenemedi. API ve veritabanı bağlantısını kontrol edin.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function changeStatus(vehicle: Vehicle, status: Vehicle["status"]) {
    setError("");
    try {
      const result = await api.updateVehicleStatus(vehicle.id, status);
      setVehicles((current) => current.map((item) => item.id === vehicle.id ? result.vehicle : item));
      setEvents((await api.auditEvents()).events);
    } catch {
      setError("Araç durumu güncellenemedi.");
    }
  }

  const active = vehicles.filter((v) => v.status === "active").length;
  async function addDriver() {
    const fullName=window.prompt("Sürücü adı soyadı"); if(!fullName) return;
    const phone=window.prompt("Telefon numarası"); if(!phone) return;
    try { await api.createDriver({fullName,phone,status:"active"}); await refresh(); }
    catch { setError("Sürücü eklenemedi. Telefon numarası daha önce kullanılmış olabilir."); }
  }
  async function addDevice() {
    const ownership=window.confirm("Şirket cihazı mı? Evet: şirket, Hayır: kişisel") ? "company" : "personal";
    const platform=window.confirm("Android cihaz mı? Evet: Android, Hayır: iOS") ? "android" : "ios";
    const model=window.prompt("Cihaz marka/modeli"); if(!model) return;
    const driverId=window.prompt("Atanacak sürücünün ID'si (boş bırakılabilir)") || null;
    const identifier=ownership==="company" ? window.prompt("Envanter/seri numarası (opsiyonel)") || undefined : undefined;
    try { await api.createDevice({ownership,platform,model,driverId,identifier,status:"active"}); await refresh(); }
    catch { setError("Cihaz eklenemedi. Sürücü ID'sini kontrol edin."); }
  }
  return <div className="app-shell">
    <aside><div className="brand"><span>F</span> Filo</div><nav>
      <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>⌂ <b>Genel Bakış</b></button>
      <button className={view === "vehicles" ? "active" : ""} onClick={() => setView("vehicles")}>▣ Araçlar</button>
      <button className={view === "audit" ? "active" : ""} onClick={() => setView("audit")}>✓ İşlem Geçmişi</button>
      <button className={view === "drivers" ? "active" : ""} onClick={() => setView("drivers")}>♙ Sürücüler</button>
      <button className={view === "devices" ? "active" : ""} onClick={() => setView("devices")}>▤ Cihazlar</button>
      {["owner","admin"].includes(user.role) && <button className={view === "members" ? "active" : ""} onClick={() => setView("members")}>♟ Kullanıcılar</button>}
    </nav><div className="aside-foot"><small>AKTİF TENANT</small><strong>{user.tenantName}</strong></div></aside>
    <main className="dashboard">
      <header><div><p className="eyebrow">OPERASYON KONTROL MERKEZİ</p><h1>Günaydın, {user.fullName.split(" ")[0]}</h1></div><div className="user"><span>{user.fullName.slice(0,2).toUpperCase()}</span><div><strong>{user.fullName}</strong><small>{user.role}</small></div><button className="secondary" onClick={onLogout}>Çıkış</button></div></header>
      {error && <p className="error page-error" role="alert">{error}</p>}
      {view === "overview" && <>
      <section className="hero"><div><p>FİLO DURUMU</p><h2>{vehicles.length ? `${active} araç operasyona hazır` : "İlk aracınızı filoya ekleyin"}</h2><span>Tenant izolasyonlu araç ana kaydı aktif.</span></div><button onClick={() => setOpen(true)}>＋ Yeni araç ekle</button></section>
      <section className="metrics">
        <article><span>Toplam araç</span><strong>{vehicles.length}</strong><small>filo envanteri</small></article>
        <article><span>Aktif</span><strong>{active}</strong><small>operasyona hazır</small></article>
        <article><span>Bakımda</span><strong>{vehicles.filter(v=>v.status==="maintenance").length}</strong><small>servis bekliyor</small></article>
        <article><span>Tenant</span><strong>1</strong><small>RLS korumalı</small></article>
      </section>
      </>}
      {(view === "overview" || view === "vehicles") &&
      <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">ARAÇ ANA KAYITLARI</p><h2>Filo envanteri</h2></div><div><span>{vehicles.length} kayıt</span>{view === "vehicles" && <button onClick={() => setOpen(true)}>＋ Araç ekle</button>}</div></div>
        {vehicles.length === 0 ? <div className="empty"><b>Henüz araç yok</b><p>İlk güvenli dikey dilimi tamamlamak için bir araç ekleyin.</p><button onClick={() => setOpen(true)}>Araç ekle</button></div> :
        <div className="table-wrap"><table><thead><tr><th>Plaka</th><th>Araç</th><th>Yıl</th><th>Durum</th><th>Kayıt tarihi</th></tr></thead><tbody>{vehicles.map(v=><tr key={v.id}><td><b>{v.plate}</b></td><td>{v.make} {v.model}</td><td>{v.year}</td><td><select className={`status-select ${v.status}`} value={v.status} onChange={(event) => void changeStatus(v, event.target.value as Vehicle["status"])}><option value="active">Aktif</option><option value="maintenance">Bakımda</option><option value="inactive">Pasif</option></select></td><td>{new Date(v.createdAt).toLocaleDateString("tr-TR")}</td></tr>)}</tbody></table></div>}
      </section>
      }
      {view === "audit" && <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">DEĞİŞTİRİLEMEZ KAYIT</p><h2>İşlem geçmişi</h2></div><span>{events.length} olay</span></div>
        {events.length === 0 ? <div className="empty"><b>Henüz işlem kaydı yok</b><p>Araç eklediğinizde veya durumunu değiştirdiğinizde burada görünecek.</p></div> :
        <div className="audit-list">{events.map((event) => <article key={event.id}>
          <span className="audit-icon">✓</span><div><b>{event.action === "vehicle.created" ? "Araç eklendi" : "Araç durumu değiştirildi"}</b><p>{String(event.metadata.plate ?? "Araç")} · {event.actorName}</p></div><time>{new Date(event.createdAt).toLocaleString("tr-TR")}</time>
        </article>)}</div>}
      </section>}
      {view === "drivers" && <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">SÜRÜCÜ YÖNETİMİ</p><h2>Sürücüler</h2></div>{["owner","admin"].includes(user.role)&&<button onClick={()=>void addDriver()}>＋ Sürücü ekle</button>}</div>
        <div className="table-wrap"><table><thead><tr><th>Ad soyad</th><th>Telefon</th><th>Ehliyet</th><th>Durum</th><th>Kayıt ID</th></tr></thead><tbody>{drivers.map(d=><tr key={d.id}><td><b>{d.fullName}</b></td><td>{d.phone}</td><td>{d.licenseNumber??"—"}</td><td>{d.status==="active"?"Aktif":"Pasif"}</td><td><small>{d.id}</small></td></tr>)}</tbody></table></div>
      </section>}
      {view === "devices" && <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">CİHAZ ENVANTERİ</p><h2>Şirket ve kişisel cihazlar</h2></div>{["owner","admin"].includes(user.role)&&<button onClick={()=>void addDevice()}>＋ Cihaz ekle</button>}</div>
        <div className="table-wrap"><table><thead><tr><th>Cihaz</th><th>Sahiplik</th><th>Platform</th><th>Sürücü</th><th>Tanımlayıcı</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><td><b>{d.model}</b></td><td>{d.ownership==="company"?"Şirket":"Kişisel"}</td><td>{d.platform}</td><td>{d.driverName??"Atanmamış"}</td><td>{d.identifier??"Veri minimizasyonu"}</td></tr>)}</tbody></table></div>
      </section>}
      {view === "members" && <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">ROL VE YETKİ</p><h2>Kullanıcılar</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th></tr></thead><tbody>{members.map(m=><tr key={m.userId}><td><b>{m.fullName}</b></td><td>{m.email}</td><td>{user.role==="owner"&&m.role!=="owner"?<select value={m.role} onChange={async e=>{await api.updateMemberRole(m.userId,e.target.value as "admin"|"operator"|"viewer");await refresh();}}><option value="admin">Admin</option><option value="operator">Operatör</option><option value="viewer">Görüntüleyici</option></select>:m.role}</td></tr>)}</tbody></table></div>
      </section>}
    </main>
    {open && <VehicleForm onClose={() => setOpen(false)} onCreated={(v) => { setVehicles([v,...vehicles]); setOpen(false); void refresh(); }} />}
  </div>;
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(r=>setUser(r.user)).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  if (loading) return <div className="loader">Filo hazırlanıyor…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Dashboard user={user} onLogout={async()=>{ await api.logout(); setUser(null); }} />;
}
