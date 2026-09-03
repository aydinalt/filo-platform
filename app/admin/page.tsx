"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, Bell, Boxes, Building2, CalendarDays, ChevronDown, ChevronRight,
  CircleDollarSign, Command, CreditCard, Gauge, Grid2X2, Headphones, Languages,
  LockKeyhole, Menu, Moon, MoreHorizontal, PackageCheck, Plus, Search, ServerCog,
  Settings, ShieldCheck, Sun, Truck, UserRound, Users, Webhook, X,
  type LucideIcon,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import styles from "./admin.module.css";

type View = "dashboard" | "companies" | "users" | "plans" | "integrations" | "security" | "system";
type Company = { id: string; name: string; plan: string; users: number; vehicles: number; status: "Aktif" | "Kurulum" | "Kısıtlı"; owner: string; updated: string };

const weekly = [
  { day: "Pzt", trips: 318, events: 32 }, { day: "Sal", trips: 362, events: 28 },
  { day: "Çar", trips: 341, events: 41 }, { day: "Per", trips: 408, events: 35 },
  { day: "Cum", trips: 447, events: 29 }, { day: "Cmt", trips: 302, events: 18 },
  { day: "Paz", trips: 276, events: 15 },
];

const tenantMix = [
  { name: "Aktif", value: 82, color: "#3c82f6" },
  { name: "Kurulum", value: 11, color: "#f7bd52" },
  { name: "Kısıtlı", value: 7, color: "#f26b7a" },
];

const initialCompanies: Company[] = [
  { id: "CMP-1048", name: "Atlas Lojistik", plan: "Kurumsal", users: 24, vehicles: 186, status: "Aktif", owner: "Aydın Altuntaş", updated: "2 dk önce" },
  { id: "CMP-1047", name: "Marmara Dağıtım", plan: "Pro", users: 12, vehicles: 74, status: "Aktif", owner: "Ece Demir", updated: "18 dk önce" },
  { id: "CMP-1046", name: "Anka Saha Hizmetleri", plan: "Pro", users: 8, vehicles: 42, status: "Kurulum", owner: "Mehmet Kaya", updated: "1 saat önce" },
  { id: "CMP-1045", name: "Ege Soğuk Zincir", plan: "Kurumsal", users: 19, vehicles: 98, status: "Aktif", owner: "Selin Arı", updated: "3 saat önce" },
  { id: "CMP-1044", name: "Kuzey Servis Ağı", plan: "Başlangıç", users: 4, vehicles: 16, status: "Kısıtlı", owner: "Burak Yalçın", updated: "Dün" },
];

const userRows = [
  { name: "Aydın Altuntaş", email: "aydin@atlaslojistik.com", role: "Owner", company: "Atlas Lojistik", state: "Aktif" },
  { name: "Ece Demir", email: "ece@marmaradagitim.com", role: "Admin", company: "Marmara Dağıtım", state: "Aktif" },
  { name: "Mehmet Kaya", email: "mehmet@ankasaha.com", role: "Admin", company: "Anka Saha Hizmetleri", state: "Davet bekliyor" },
  { name: "Selin Arı", email: "selin@egesoguk.com", role: "Owner", company: "Ege Soğuk Zincir", state: "Aktif" },
];

const navGroups: Array<{ label: string; items: Array<{ id: View; label: string; icon: LucideIcon; badge?: string }> }> = [
  { label: "ANA MENÜ", items: [{ id: "dashboard", label: "Genel Bakış", icon: Gauge }, { id: "companies", label: "Firmalar", icon: Building2, badge: "23" }, { id: "users", label: "Kullanıcılar", icon: Users }] },
  { label: "TİCARİ YÖNETİM", items: [{ id: "plans", label: "Paketler & Abonelik", icon: CreditCard }, { id: "integrations", label: "Entegrasyonlar", icon: Webhook }] },
  { label: "PLATFORM", items: [{ id: "security", label: "Güvenlik & Audit", icon: ShieldCheck, badge: "3" }, { id: "system", label: "Sistem Sağlığı", icon: ServerCog }] },
];

const viewTitles: Record<View, { title: string; breadcrumb: string; description: string }> = {
  dashboard: { title: "Yönetim Özeti", breadcrumb: "Genel Bakış", description: "Platformun ticari ve teknik durumunu tek ekrandan izleyin." },
  companies: { title: "Firma Yönetimi", breadcrumb: "Firmalar", description: "Tenant hesaplarını, paketleri ve kullanım durumunu yönetin." },
  users: { title: "Kullanıcı Yönetimi", breadcrumb: "Kullanıcılar", description: "Platform genelindeki kullanıcı ve yönetici erişimlerini denetleyin." },
  plans: { title: "Paketler & Abonelik", breadcrumb: "Abonelik", description: "Paket kapasitesi, gelir ve yenileme süreçlerini izleyin." },
  integrations: { title: "Entegrasyon Merkezi", breadcrumb: "Entegrasyonlar", description: "Sağlayıcı, webhook ve bağlantı sağlığını yönetin." },
  security: { title: "Güvenlik & Audit", breadcrumb: "Güvenlik", description: "Yetkili işlemler, MFA ve denetim olaylarını takip edin." },
  system: { title: "Sistem Sağlığı", breadcrumb: "Sistem", description: "Servis, kuyruk, veritabanı ve depolama durumunu izleyin." },
};

function MetricCard({ label, value, trend, icon: Icon, tone = "blue" }: { label: string; value: string; trend: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "rose" }) {
  return <article className={styles.metricCard}><div><span>{label}</span><strong>{value}</strong><small className={styles[`trend${tone}`]}>↗ {trend}</small></div><i className={`${styles.metricIcon} ${styles[`icon${tone}`]}`}><Icon size={19} /></i></article>;
}

export default function AdminPage() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dark, setDark] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState(initialCompanies);
  const [companyModal, setCompanyModal] = useState(false);
  const [draft, setDraft] = useState({ name: "", owner: "", plan: "Pro" });
  const [toast, setToast] = useState("");

  const title = viewTitles[view];
  const filteredCompanies = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("tr-TR");
    return companies.filter((company) => !text || [company.name, company.owner, company.plan, company.id].some((value) => value.toLocaleLowerCase("tr-TR").includes(text)));
  }, [companies, query]);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const addCompany = (event: FormEvent) => {
    event.preventDefault();
    if (draft.name.trim().length < 3 || draft.owner.trim().length < 3) return;
    setCompanies((items) => [{ id: `CMP-${1048 + items.length}`, name: draft.name.trim(), owner: draft.owner.trim(), plan: draft.plan, users: 1, vehicles: 0, status: "Kurulum", updated: "Şimdi" }, ...items]);
    setDraft({ name: "", owner: "", plan: "Pro" });
    setCompanyModal(false);
    notify("Firma taslağı oluşturuldu. Üretim verisine yazılmadı.");
  };

  return <main className={`${styles.adminShell} ${dark ? styles.dark : ""}`}>
    <aside className={`${styles.sidebar} ${mobileMenu ? styles.sidebarOpen : ""}`}>
      <div className={styles.logo}><span>F</span><div><strong>Filo</strong><small>ADMIN</small></div><button aria-label="Menüyü kapat" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
      <nav aria-label="Admin navigasyonu">
        {navGroups.map((group) => <section key={group.label}><h2>{group.label}</h2>{group.items.map((item) => <button key={item.id} className={view === item.id ? styles.activeNav : ""} onClick={() => { setView(item.id); setMobileMenu(false); }}><item.icon size={17} /><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}<ChevronRight className={styles.chevron} size={14} /></button>)}</section>)}
      </nav>
      <div className={styles.supportCard}><Headphones size={18} /><div><strong>Yönetici desteği</strong><small>Kritik konularda öncelikli kanal</small></div><button onClick={() => notify("Destek merkezi açıldı.")}>Destek al</button></div>
      <Link className={styles.backLink} href="/prototype">← Operasyon prototipine dön</Link>
    </aside>

    {mobileMenu && <button className={styles.mobileBackdrop} aria-label="Menüyü kapat" onClick={() => setMobileMenu(false)} />}

    <section className={styles.pageArea}>
      <header className={styles.topbar}>
        <button className={styles.menuButton} aria-label="Menüyü aç" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
        <label className={styles.quickSearch}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hızlı arama..." /></label>
        <button className={styles.megaButton}>Hızlı İşlemler <ChevronDown size={14} /></button>
        <div className={styles.topSpacer} />
        <button className={styles.topIcon} aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"} onClick={() => setDark((value) => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className={styles.topIcon} aria-label="Uygulamalar"><Grid2X2 size={18} /></button>
        <div className={styles.popoverAnchor}><button className={`${styles.topIcon} ${styles.withDot}`} aria-label="Bildirimler" onClick={() => setNotifications((value) => !value)}><Bell size={18} /></button>{notifications && <div className={styles.notificationPopover}><header><strong>Bildirimler</strong><span>3 yeni</span></header><button><i className={styles.noticeCritical}><ShieldCheck size={15} /></i><span><b>MFA zorunluluk kontrolü</b><small>3 yönetici hesabı · 5 dk önce</small></span></button><button><i><Webhook size={15} /></i><span><b>Webhook teslimatı gecikti</b><small>Resend · 18 dk önce</small></span></button><button><i><CreditCard size={15} /></i><span><b>Abonelik yenilemesi yaklaşıyor</b><small>4 firma · bugün</small></span></button></div>}</div>
        <button className={styles.language}><Languages size={16} /> TR <ChevronDown size={13} /></button>
        <div className={styles.profileAnchor}><button className={styles.profileButton} onClick={() => setProfileOpen((value) => !value)}><span>AA</span><p><strong>Aydın Altuntaş</strong><small>Platform Owner</small></p><ChevronDown size={14} /></button>{profileOpen && <div className={styles.profileMenu}><button><UserRound size={15} /> Profilim</button><button><Settings size={15} /> Ayarlar</button><button><LockKeyhole size={15} /> Güvenli çıkış</button></div>}</div>
      </header>

      <div className={styles.content}>
        <header className={styles.pageHeader}><div><h1>{title.title}</h1><p>{title.description}</p></div><ol><li>Filo</li><li>Admin</li><li>{title.breadcrumb}</li></ol></header>
        <div className={styles.prototypeNote}><span>ADMIN PROTOTİPİ</span> Örnek veri kullanır; butonlar üretim kayıtlarını değiştirmez.</div>
        {toast && <div className={styles.toast} role="status"><ShieldCheck size={16} />{toast}</div>}

        {view === "dashboard" && <>
          <section className={styles.metricsGrid}>
            <article className={styles.welcomeCard}><div><span>İYİ AKŞAMLAR,</span><h2>Aydın!</h2><p><CalendarDays size={14} /> 2 Eylül 2026</p></div><Command size={52} /></article>
            <MetricCard label="AKTİF FİRMA" value="23" trend="2 yeni firma" icon={Building2} />
            <MetricCard label="TOPLAM ARAÇ" value="1.248" trend="%8,4 büyüme" icon={Truck} tone="green" />
            <MetricCard label="AYLIK GELİR" value="₺684,2K" trend="%6,1 artış" icon={CircleDollarSign} tone="amber" />
          </section>

          <section className={styles.analyticsGrid}>
            <article className={styles.card}><header className={styles.cardHeader}><div><h2>Firma Dağılımı</h2><p>Tenant yaşam döngüsü ve aktivasyon durumu</p></div><button aria-label="Firma dağılımı seçenekleri"><MoreHorizontal size={18} /></button></header><div className={styles.donutLayout}><div className={styles.chartBox} aria-label="Firma durum dağılımı grafiği"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={tenantMix} dataKey="value" innerRadius={62} outerRadius={86} paddingAngle={3} stroke="none">{tenantMix.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className={styles.donutCenter}><strong>23</strong><span>Firma</span></div></div><div className={styles.legend}>{tenantMix.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>%{item.value}</strong></div>)}</div></div></article>
            <article className={styles.card}><header className={styles.cardHeader}><div><h2>Haftalık Operasyon</h2><p>Yolculuklar ve incelenen risk olayları</p></div><button onClick={() => notify("Grafik verileri yenilendi.")}><Activity size={15} /> Yenile</button></header><div className={styles.barChart} aria-label="Haftalık operasyon grafiği"><ResponsiveContainer width="100%" height="100%"><BarChart data={weekly} barGap={5}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e7eaf0" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} width={34} /><Tooltip /><Bar dataKey="trips" name="Yolculuk" fill="#3c82f6" radius={[4,4,0,0]} /><Bar dataKey="events" name="Risk olayı" fill="#f7bd52" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></article>
          </section>

          <section className={styles.lowerGrid}>
            <CompanyTable rows={filteredCompanies.slice(0, 5)} onNew={() => setCompanyModal(true)} onNotify={notify} />
            <SystemHealth onNotify={notify} />
          </section>
        </>}

        {view === "companies" && <CompanyTable rows={filteredCompanies} onNew={() => setCompanyModal(true)} onNotify={notify} full />}
        {view === "users" && <UserTable onNotify={notify} />}
        {view === "plans" && <PlanView />}
        {view === "integrations" && <IntegrationView onNotify={notify} />}
        {view === "security" && <SecurityView onNotify={notify} />}
        {view === "system" && <SystemHealth onNotify={notify} full />}
      </div>
    </section>

    {companyModal && <div className={styles.modalBackdrop} onMouseDown={(event) => event.target === event.currentTarget && setCompanyModal(false)}><form className={styles.modal} onSubmit={addCompany} role="dialog" aria-modal="true" aria-labelledby="company-title"><header><div><span>FİRMA OLUŞTURMA</span><h2 id="company-title">Yeni tenant hesabı</h2><p>Firma owner ve paket bilgilerini tanımlayın.</p></div><button type="button" aria-label="Kapat" onClick={() => setCompanyModal(false)}><X size={18} /></button></header><label>Firma adı<input required minLength={3} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Örn. Anadolu Lojistik" /></label><label>Owner adı<input required minLength={3} value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Ad soyad" /></label><label>Paket<select value={draft.plan} onChange={(event) => setDraft({ ...draft, plan: event.target.value })}><option>Başlangıç</option><option>Pro</option><option>Kurumsal</option></select></label><div><button type="button" onClick={() => setCompanyModal(false)}>Vazgeç</button><button className={styles.primary} type="submit"><Plus size={15} /> Firma taslağı oluştur</button></div></form></div>}
  </main>;
}

function CompanyTable({ rows, onNew, onNotify, full = false }: { rows: Company[]; onNew: () => void; onNotify: (message: string) => void; full?: boolean }) {
  return <article className={`${styles.card} ${full ? styles.fullCard : ""}`}><header className={styles.cardHeader}><div><h2>{full ? "Tüm Firmalar" : "Son Firma Hareketleri"}</h2><p>{rows.length} firma görüntüleniyor</p></div><div className={styles.headerActions}><button onClick={() => onNotify("Firma listesi CSV için hazırlandı.")}>Dışa aktar</button><button className={styles.primary} onClick={onNew}><Plus size={14} /> Yeni firma</button></div></header><div className={styles.tableWrap}><table><thead><tr><th>Firma</th><th>Paket</th><th>Kullanıcı</th><th>Araç</th><th>Durum</th><th>Güncelleme</th><th /></tr></thead><tbody>{rows.map((company) => <tr key={company.id}><td><strong>{company.name}</strong><small>{company.id} · {company.owner}</small></td><td>{company.plan}</td><td>{company.users}</td><td>{company.vehicles}</td><td><span className={`${styles.status} ${styles[`status${company.status}`]}`}>{company.status}</span></td><td>{company.updated}</td><td><button aria-label={`${company.name} işlemleri`} onClick={() => onNotify(`${company.name} detay paneli açıldı.`)}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></article>;
}

function UserTable({ onNotify }: { onNotify: (message: string) => void }) {
  return <article className={`${styles.card} ${styles.fullCard}`}><header className={styles.cardHeader}><div><h2>Platform Kullanıcıları</h2><p>Owner ve yönetici hesaplarının erişim durumu</p></div><button className={styles.primary} onClick={() => onNotify("Kullanıcı davet akışı açıldı.")}><Plus size={14} /> Kullanıcı davet et</button></header><div className={styles.tableWrap}><table><thead><tr><th>Kullanıcı</th><th>Firma</th><th>Rol</th><th>Durum</th><th>Güvenlik</th><th /></tr></thead><tbody>{userRows.map((user) => <tr key={user.email}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.company}</td><td>{user.role}</td><td><span className={`${styles.status} ${user.state === "Aktif" ? styles.statusAktif : styles.statusKurulum}`}>{user.state}</span></td><td><span className={styles.mfa}><LockKeyhole size={13} /> MFA</span></td><td><button aria-label={`${user.name} işlemleri`} onClick={() => onNotify(`${user.name} erişim ayrıntısı açıldı.`)}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></article>;
}

function PlanView() {
  return <section className={styles.planGrid}>{[{ name: "Başlangıç", price: "₺1.490", companies: 5, tone: "blue" }, { name: "Pro", price: "₺4.990", companies: 11, tone: "green" }, { name: "Kurumsal", price: "Özel", companies: 7, tone: "amber" }].map((plan) => <article className={styles.planCard} key={plan.name}><i className={styles[`plan${plan.tone}`]}><PackageCheck size={20} /></i><span>{plan.name}</span><strong>{plan.price}</strong><small>aylık · KDV hariç</small><hr /><p><b>{plan.companies}</b> aktif firma</p><p>Rol ve kapasite limitleri sunucuda uygulanır.</p><button>Paketi yönet</button></article>)}</section>;
}

function IntegrationView({ onNotify }: { onNotify: (message: string) => void }) {
  return <section className={styles.integrationGrid}>{[{ name: "Supabase", meta: "Auth · PostgreSQL · Storage", state: "Bağlı", icon: Boxes }, { name: "Resend", meta: "E-posta teslimatı", state: "Bağlı", icon: Webhook }, { name: "Telematik Gateway", meta: "TCP → HTTPS adaptörü", state: "İzleniyor", icon: Truck }, { name: "Muhasebe Sağlayıcısı", meta: "E-belge ve ödeme", state: "Kurulum", icon: CircleDollarSign }].map((item) => <article className={styles.integrationCard} key={item.name}><i><item.icon size={20} /></i><div><strong>{item.name}</strong><small>{item.meta}</small></div><span>{item.state}</span><button onClick={() => onNotify(`${item.name} bağlantı ayrıntısı açıldı.`)}>Yönet</button></article>)}</section>;
}

function SecurityView({ onNotify }: { onNotify: (message: string) => void }) {
  return <section className={styles.securityGrid}><article className={styles.securityHero}><ShieldCheck size={35} /><div><span>GÜVENLİK DURUMU</span><h2>Koruma politikaları etkin</h2><p>Owner ve ayrıcalıklı işlemler MFA ile korunuyor; tüm yönetim işlemleri audit kaydına bağlanıyor.</p></div><strong>94/100</strong></article><article className={styles.card}><header className={styles.cardHeader}><div><h2>İncelenecek Olaylar</h2><p>Son 24 saat</p></div></header>{["3 hesapta MFA doğrulaması bekliyor", "2 başarısız webhook imza kontrolü", "1 yeni cihaz oturumu"].map((item, index) => <button className={styles.securityEvent} key={item} onClick={() => onNotify("Güvenlik olayı incelemeye açıldı.")}><span>{index + 1}</span>{item}<ChevronRight size={15} /></button>)}</article></section>;
}

function SystemHealth({ onNotify, full = false }: { onNotify: (message: string) => void; full?: boolean }) {
  const services = [{ name: "Uygulama API", value: 100, state: "Sağlıklı" }, { name: "PostgreSQL", value: 98, state: "Sağlıklı" }, { name: "Dosya depolama", value: 94, state: "Sağlıklı" }, { name: "İşlem kuyruğu", value: 86, state: "İzleniyor" }];
  return <article className={`${styles.card} ${styles.healthCard} ${full ? styles.fullCard : ""}`}><header className={styles.cardHeader}><div><h2>Sistem Sağlığı</h2><p>Son kontrol · 2 dk önce</p></div><button onClick={() => onNotify("Sistem sağlık kontrolü yenilendi.")}><Activity size={15} /> Yenile</button></header><div className={styles.healthList}>{services.map((service) => <div key={service.name}><p><strong>{service.name}</strong><span>{service.state}</span></p><progress value={service.value} max="100" /><b>%{service.value}</b></div>)}</div><footer><span><i /> Tüm kritik servisler erişilebilir</span><button onClick={() => onNotify("Teknik gözlem merkezi açıldı.")}>Gözlem merkezini aç</button></footer></article>;
}
