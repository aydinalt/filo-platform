import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AlertRule, Assignment, AuditEvent, CreateVehicleInput, Device, Driver, Geofence, GeofenceEvent, LatestLocation, Member, OperationalAlert, SessionUser, ShiftRoute, TrackingStatus, Vehicle, WorkShift } from "@filo/contracts";
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
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [shifts,setShifts]=useState<WorkShift[]>([]);
  const [tracking,setTracking]=useState<TrackingStatus[]>([]);
  const [locations,setLocations]=useState<LatestLocation[]>([]);
  const [selectedRoute,setSelectedRoute]=useState<ShiftRoute|null>(null);
  const [geofences,setGeofences]=useState<Geofence[]>([]);
  const [geofenceEvents,setGeofenceEvents]=useState<GeofenceEvent[]>([]);
  const [alertRules,setAlertRules]=useState<AlertRule[]>([]);
  const [alerts,setAlerts]=useState<OperationalAlert[]>([]);
  const [view, setView] = useState<"overview" | "vehicles" | "drivers" | "devices" | "operations" | "geofences" | "alerts" | "mobile" | "members" | "audit">("overview");
  const [error, setError] = useState("");
  const [mobileAssignment,setMobileAssignment]=useState("");
  const [mobileMessage,setMobileMessage]=useState("Takip kapalı");
  const watchId=useRef<number|null>(null);

  async function refresh() {
    setError("");
    try {
      const [vehicleResult, auditResult, driverResult, deviceResult,assignmentResult,shiftResult,trackingResult,locationResult,geofenceResult,geofenceEventResult,alertRuleResult,alertResult] = await Promise.all([api.vehicles(), api.auditEvents(), api.drivers(), api.devices(),api.assignments(),api.shifts(),api.tracking(),api.latestLocations(),api.geofences(),api.geofenceEvents(),api.alertRules(),api.alerts()]);
      setVehicles(vehicleResult.vehicles);
      setEvents(auditResult.events);
      setDrivers(driverResult.drivers); setDevices(deviceResult.devices);
      setAssignments(assignmentResult.assignments);setShifts(shiftResult.shifts);setTracking(trackingResult.tracking);
      setLocations(locationResult.locations);
      setGeofences(geofenceResult.geofences);setGeofenceEvents(geofenceEventResult.events);
      setAlertRules(alertRuleResult.rules);setAlerts(alertResult.alerts);
      if (["owner","admin"].includes(user.role)) setMembers((await api.members()).members);
    } catch {
      setError("Veriler yüklenemedi. API ve veritabanı bağlantısını kontrol edin.");
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(()=>()=>{if(watchId.current!==null)navigator.geolocation.clearWatch(watchId.current);},[]);

  async function startMobileTracking(){
    if(!mobileAssignment){setMobileMessage("Önce aktif bir atama seçin.");return;}
    if(!navigator.geolocation){setMobileMessage("Bu cihaz konum özelliğini desteklemiyor.");return;}
    await api.updateTracking(mobileAssignment,"granted_while_in_use","tracking");
    watchId.current=navigator.geolocation.watchPosition(async position=>{
      try{
        await api.sendLocation({assignmentId:mobileAssignment,eventId:crypto.randomUUID(),recordedAt:new Date(position.timestamp).toISOString(),latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:position.coords.accuracy,speedMps:position.coords.speed,headingDegrees:position.coords.heading});
        setMobileMessage(`Konum gönderildi · ${new Date().toLocaleTimeString("tr-TR")}`);
        setLocations((await api.latestLocations()).locations);
      }catch(e){setMobileMessage(e instanceof Error&&e.message==="TRACKING_NOT_ACTIVE"?"Aktif vardiya olmadan konum gönderilemez.":"Konum gönderilemedi.");}
    },()=>setMobileMessage("Konum izni verilmedi veya konum alınamadı."),{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
    setMobileMessage("Konum izni bekleniyor…");
  }
  async function stopMobileTracking(){
    if(watchId.current!==null){navigator.geolocation.clearWatch(watchId.current);watchId.current=null;}
    if(mobileAssignment)await api.updateTracking(mobileAssignment,"granted_while_in_use","paused");
    setMobileMessage("Takip kullanıcı tarafından durduruldu.");await refresh();
  }

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
  async function addAssignment(){
    const vehicleId=window.prompt("Araç ID");if(!vehicleId)return;
    const driverId=window.prompt("Sürücü ID");if(!driverId)return;
    const deviceId=window.prompt("Cihaz ID (opsiyonel)")||null;
    try{await api.createAssignment(vehicleId,driverId,deviceId);await refresh();}
    catch(e){setError(e instanceof Error&&e.message==="ACTIVE_ASSIGNMENT_CONFLICT"?"Araç veya sürücünün zaten aktif ataması var.":"Atama oluşturulamadı.");}
  }
  async function addGeofence(){
    const name=window.prompt("Bölge adı (ör. Merkez Depo)");if(!name)return;
    const latitude=Number(window.prompt("Merkez enlem (ör. 41.015)"));
    const longitude=Number(window.prompt("Merkez boylam (ör. 29.010)"));
    const radiusMeters=Number(window.prompt("Yarıçap metre (50–50000)","250"));
    try{await api.createGeofence({name,latitude,longitude,radiusMeters});await refresh();}
    catch(e){setError(e instanceof Error&&e.message==="GEOFENCE_NAME_EXISTS"?"Bu adla aktif bir bölge zaten var.":"Bölge oluşturulamadı; koordinat ve yarıçapı kontrol edin.");}
  }
  async function addAlertRule(){
    const name=window.prompt("Uyarı kuralı adı");if(!name)return;
    const type=window.prompt("Tür: speeding, geofence_entered veya geofence_exited","speeding");
    if(!type||!["speeding","geofence_entered","geofence_exited"].includes(type)){setError("Geçerli bir uyarı türü seçin.");return;}
    const speeding=type==="speeding";
    const thresholdKph=speeding?Number(window.prompt("Hız eşiği (km/sa)","120")):null;
    const geofenceId=speeding?null:window.prompt("Bölge ID");
    try{await api.createAlertRule({name,type:type as "speeding"|"geofence_entered"|"geofence_exited",thresholdKph,geofenceId:geofenceId||null});await refresh();}
    catch{setError("Uyarı kuralı oluşturulamadı; tür ve hedef değerlerini kontrol edin.");}
  }
  return <div className="app-shell">
    <aside><div className="brand"><span>F</span> Filo</div><nav>
      <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>⌂ <b>Genel Bakış</b></button>
      <button className={view === "vehicles" ? "active" : ""} onClick={() => setView("vehicles")}>▣ Araçlar</button>
      <button className={view === "audit" ? "active" : ""} onClick={() => setView("audit")}>✓ İşlem Geçmişi</button>
      <button className={view === "drivers" ? "active" : ""} onClick={() => setView("drivers")}>♙ Sürücüler</button>
      <button className={view === "devices" ? "active" : ""} onClick={() => setView("devices")}>▤ Cihazlar</button>
      <button className={view === "operations" ? "active" : ""} onClick={() => setView("operations")}>↔ Operasyonlar</button>
      <button className={view === "geofences" ? "active" : ""} onClick={() => setView("geofences")}>◎ Bölgeler</button>
      <button className={view === "alerts" ? "active" : ""} onClick={() => setView("alerts")}>⚠ Uyarılar {alerts.filter(a=>a.status==="open").length?`(${alerts.filter(a=>a.status==="open").length})`:""}</button>
      {user.role!=="viewer"&&<button className={view === "mobile" ? "active" : ""} onClick={() => setView("mobile")}>⌖ Telefon Takibi</button>}
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
      {view === "operations" && <>
      <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">ARAÇ–SÜRÜCÜ ATAMASI</p><h2>Aktif ve geçmiş atamalar</h2></div>{user.role!=="viewer"&&<button onClick={()=>void addAssignment()}>＋ Atama oluştur</button>}</div>
        <div className="table-wrap"><table><thead><tr><th>Araç</th><th>Sürücü</th><th>Cihaz</th><th>Başlangıç</th><th>Durum / işlem</th></tr></thead><tbody>{assignments.map(a=><tr key={a.id}><td><b>{a.vehiclePlate}</b><br/><small>{a.vehicleId}</small></td><td>{a.driverName}<br/><small>{a.driverId}</small></td><td>{a.deviceModel??"Atanmamış"}<br/><small>{a.deviceId}</small></td><td>{new Date(a.startsAt).toLocaleString("tr-TR")}</td><td>{a.endedAt?"Tamamlandı":user.role==="viewer"?"Aktif":<button onClick={async()=>{await api.endAssignment(a.id);await refresh();}}>Atamayı bitir</button>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="table-card spaced">
        <div className="section-head"><div><p className="eyebrow">VARDİYA / ÇALIŞMA OTURUMU</p><h2>Vardiyalar</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Araç</th><th>Sürücü</th><th>Başlangıç</th><th>Durum</th><th>Rota</th></tr></thead><tbody>{shifts.map(s=><tr key={s.id}><td>{s.vehiclePlate}</td><td>{s.driverName}</td><td>{new Date(s.startedAt).toLocaleString("tr-TR")}</td><td>{s.status==="active"&&user.role!=="viewer"?<button onClick={async()=>{await api.endShift(s.id);await refresh();}}>Vardiyayı bitir</button>:"Tamamlandı"}</td><td><button className="secondary" onClick={async()=>setSelectedRoute((await api.shiftRoute(s.id)).route)}>Geçmişi aç</button></td></tr>)}</tbody></table></div>
        {user.role!=="viewer"&&assignments.filter(a=>!a.endedAt).map(a=><button className="inline-action" key={a.id} onClick={async()=>{await api.startShift(a.id);await refresh();}}>Vardiya başlat: {a.vehiclePlate} / {a.driverName}</button>)}
      </section>
      <section className="table-card spaced">
        <div className="section-head"><div><p className="eyebrow">KONUM İZNİ VE TAKİP</p><h2>Takip durumları</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Atama</th><th>İzin</th><th>Takip</th><th>Güncelleme</th></tr></thead><tbody>{tracking.map(t=><tr key={t.assignmentId}><td><small>{t.assignmentId}</small></td><td>{t.permission}</td><td>{t.state}</td><td>{user.role!=="viewer"&&<><button onClick={async()=>{await api.updateTracking(t.assignmentId,"granted_always","tracking");await refresh();}}>İzin ver / başlat</button><button className="secondary" onClick={async()=>{await api.updateTracking(t.assignmentId,"denied","off");await refresh();}}>İzni geri çek</button></>}</td></tr>)}</tbody></table></div>
      </section></>}
      {view === "mobile" && <section className="table-card mobile-tracking">
        <div className="section-head"><div><p className="eyebrow">SÜRÜCÜ MOBİL WEB</p><h2>Telefon konum paylaşımı</h2></div></div>
        <p>Konum yalnız aktif vardiya sırasında ve bu ekrandaki açık kontrolle gönderilir.</p>
        <label>Aktif atama<select value={mobileAssignment} onChange={e=>setMobileAssignment(e.target.value)}><option value="">Atama seçin</option>{assignments.filter(a=>!a.endedAt).map(a=><option key={a.id} value={a.id}>{a.vehiclePlate} · {a.driverName}</option>)}</select></label>
        <div className="modal-actions"><button onClick={()=>void startMobileTracking()}>Takibi başlat</button><button className="secondary" onClick={()=>void stopMobileTracking()}>Takibi durdur</button></div>
        <div className="security-note">{mobileMessage}</div>
      </section>}
      {view === "geofences" && <>
        <section className="table-card">
          <div className="section-head"><div><p className="eyebrow">GEOFENCE YÖNETİMİ</p><h2>Operasyon bölgeleri</h2></div>{["owner","admin"].includes(user.role)&&<button onClick={()=>void addGeofence()}>＋ Bölge ekle</button>}</div>
          <div className="table-wrap"><table><thead><tr><th>Bölge</th><th>Merkez</th><th>Yarıçap</th><th>Durum / işlem</th></tr></thead><tbody>{geofences.map(g=><tr key={g.id}><td><b>{g.name}</b></td><td>{g.latitude.toFixed(5)}, {g.longitude.toFixed(5)}</td><td>{g.radiusMeters} m</td><td>{g.status==="inactive"?"Pasif":["owner","admin"].includes(user.role)?<button className="secondary" onClick={async()=>{await api.deactivateGeofence(g.id);await refresh();}}>Pasife al</button>:"Aktif"}</td></tr>)}</tbody></table></div>
          {!geofences.length&&<div className="empty"><b>Henüz bölge yok</b><p>Depo, şube veya müşteri sahası için güvenli bir dairesel bölge tanımlayın.</p></div>}
        </section>
        <section className="table-card spaced">
          <div className="section-head"><div><p className="eyebrow">GİRİŞ / ÇIKIŞ OLAYLARI</p><h2>Son bölge hareketleri</h2></div><span>{geofenceEvents.length} olay</span></div>
          <div className="table-wrap"><table><thead><tr><th>Zaman</th><th>Bölge</th><th>Araç</th><th>Sürücü</th><th>Olay</th></tr></thead><tbody>{geofenceEvents.map(e=><tr key={e.id}><td>{new Date(e.occurredAt).toLocaleString("tr-TR")}</td><td><b>{e.geofenceName}</b></td><td>{e.vehiclePlate}</td><td>{e.driverName}</td><td>{e.eventType==="entered"?"Giriş":"Çıkış"}</td></tr>)}</tbody></table></div>
          {!geofenceEvents.length&&<div className="empty"><b>Henüz giriş/çıkış olayı yok</b><p>Aktif takipteki araç bir bölge sınırını geçtiğinde otomatik oluşur.</p></div>}
        </section>
      </>}
      {view === "alerts" && <>
        <section className="table-card">
          <div className="section-head"><div><p className="eyebrow">UYARI KURALLARI</p><h2>Operasyon kuralları</h2></div>{["owner","admin"].includes(user.role)&&<button onClick={()=>void addAlertRule()}>＋ Kural ekle</button>}</div>
          <div className="table-wrap"><table><thead><tr><th>Kural</th><th>Tür</th><th>Hedef / eşik</th><th>Durum</th></tr></thead><tbody>{alertRules.map(rule=><tr key={rule.id}><td><b>{rule.name}</b></td><td>{rule.type}</td><td>{rule.thresholdKph?`${rule.thresholdKph} km/sa`:rule.geofenceId}</td><td>{rule.status==="active"?"Aktif":"Pasif"}</td></tr>)}</tbody></table></div>
          {!alertRules.length&&<div className="empty"><b>Henüz uyarı kuralı yok</b><p>Hız veya bölge geçişi için ilk kuralı oluşturun.</p></div>}
        </section>
        <section className="table-card spaced">
          <div className="section-head"><div><p className="eyebrow">MÜDAHALE MERKEZİ</p><h2>Operasyon uyarıları</h2></div><span>{alerts.filter(a=>a.status==="open").length} açık</span></div>
          <div className="table-wrap"><table><thead><tr><th>Zaman</th><th>Kural</th><th>Araç / sürücü</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{alerts.map(alert=><tr key={alert.id}><td>{new Date(alert.occurredAt).toLocaleString("tr-TR")}</td><td><b>{alert.ruleName}</b><br/><small>{alert.type}</small></td><td>{alert.vehiclePlate}<br/><small>{alert.driverName}</small></td><td>{alert.status==="open"?"Açık":alert.status==="acknowledged"?"Görüldü":"Çözüldü"}</td><td>{alert.status!=="resolved"&&user.role!=="viewer"&&<>{alert.status==="open"&&<button className="secondary" onClick={async()=>{await api.updateAlertStatus(alert.id,"acknowledged");await refresh();}}>Görüldü</button>}<button onClick={async()=>{await api.updateAlertStatus(alert.id,"resolved");await refresh();}}>Çöz</button></>}</td></tr>)}</tbody></table></div>
          {!alerts.length&&<div className="empty"><b>Henüz operasyon uyarısı yok</b><p>Aktif bir kural eşleştiğinde burada görünecek.</p></div>}
        </section>
      </>}
      {view === "operations" && selectedRoute && <section className="table-card spaced route-card">
        <div className="section-head"><div><p className="eyebrow">VARDİYA ROTA GEÇMİŞİ</p><h2>{selectedRoute.vehiclePlate} · {selectedRoute.driverName}</h2></div><button className="secondary" onClick={()=>setSelectedRoute(null)}>Kapat</button></div>
        <section className="route-metrics"><article><span>Konum noktası</span><strong>{selectedRoute.pointCount}</strong></article><article><span>Tahmini mesafe</span><strong>{(selectedRoute.distanceMeters/1000).toFixed(2)} km</strong></article><article><span>Hareket</span><strong>{Math.round(selectedRoute.movingSeconds/60)} dk</strong></article><article><span>Duraklama</span><strong>{Math.round(selectedRoute.stoppedSeconds/60)} dk</strong></article></section>
        <div className="table-wrap"><table><thead><tr><th>Zaman</th><th>Koordinat</th><th>Hız</th><th>Doğruluk</th></tr></thead><tbody>{selectedRoute.points.map(point=><tr key={point.id}><td>{new Date(point.recordedAt).toLocaleString("tr-TR")}</td><td>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</td><td>{point.speedMps===null?"—":`${Math.round(point.speedMps*3.6)} km/sa`}</td><td>±{Math.round(point.accuracyMeters)} m</td></tr>)}</tbody></table></div>
        {!selectedRoute.pointCount&&<div className="empty"><b>Bu vardiyada konum kaydı yok</b><p>Takip başladığında zaman sıralı rota burada oluşur.</p></div>}
      </section>}
      {view === "operations" && <section className="table-card spaced">
        <div className="section-head"><div><p className="eyebrow">CANLI OPERASYON GÖRÜNÜMÜ</p><h2>Son alınan konumlar</h2></div><button className="secondary" onClick={()=>void refresh()}>Yenile</button></div>
        <div className="table-wrap"><table><thead><tr><th>Araç</th><th>Sürücü</th><th>Koordinat</th><th>Doğruluk</th><th>Telefon zamanı</th></tr></thead><tbody>{locations.map(l=><tr key={l.assignmentId}><td><b>{l.vehiclePlate}</b></td><td>{l.driverName}</td><td>{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</td><td>±{Math.round(l.accuracyMeters)} m</td><td>{new Date(l.recordedAt).toLocaleString("tr-TR")}</td></tr>)}</tbody></table></div>
        {!locations.length&&<div className="empty"><b>Henüz konum kaydı yok</b><p>Aktif vardiyada telefon takibi başlatıldığında burada görünecek.</p></div>}
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
