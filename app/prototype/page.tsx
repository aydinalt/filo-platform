"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./prototype.module.css";

type VehicleState = "Yolda" | "Riskte" | "Beklemede" | "Serviste";

type Vehicle = {
  id: string;
  plate: string;
  model: string;
  driver: string;
  route: string;
  state: VehicleState;
  speed: number;
  fuel: number;
  eta: string;
  lastSignal: string;
  issue?: string;
  progress: number;
};

const vehicles: Vehicle[] = [
  { id: "FL-2048", plate: "34 Filo 218", model: "Ford Transit", driver: "Mert Yılmaz", route: "İkitelli → Gebze", state: "Riskte", speed: 18, fuel: 31, eta: "47 dk", lastSignal: "1 dk önce", issue: "Rota dışı bekleme · 18 dk", progress: 62 },
  { id: "FL-1984", plate: "06 Filo 044", model: "Renault Master", driver: "Selin Kaya", route: "Sincan → Çankaya", state: "Yolda", speed: 54, fuel: 68, eta: "28 dk", lastSignal: "Şimdi", progress: 74 },
  { id: "FL-2211", plate: "35 Filo 902", model: "Fiat Ducato", driver: "Arda Demir", route: "Bornova → Torbalı", state: "Yolda", speed: 71, fuel: 52, eta: "36 dk", lastSignal: "2 dk önce", progress: 48 },
  { id: "FL-1735", plate: "16 Filo 118", model: "Mercedes Sprinter", driver: "Ece Aydın", route: "Nilüfer → Gemlik", state: "Beklemede", speed: 0, fuel: 44, eta: "Planlanıyor", lastSignal: "4 dk önce", progress: 12 },
  { id: "FL-2097", plate: "34 Filo 707", model: "Ford Transit", driver: "Burak Şen", route: "Pendik → Tuzla", state: "Serviste", speed: 0, fuel: 22, eta: "14:30", lastSignal: "9 dk önce", issue: "Periyodik bakım", progress: 88 },
];

const alerts = [
  { level: "Kritik", title: "Soğuk zincir sıcaklığı yükseldi", meta: "34 Filo 218 · 4 dk önce", owner: "Operasyon" },
  { level: "Uyarı", title: "Yakıt seviyesi rota eşiğinin altında", meta: "34 Filo 707 · 11 dk önce", owner: "Servis" },
  { level: "Bilgi", title: "Teslimat penceresi güncellendi", meta: "06 Filo 044 · 18 dk önce", owner: "Planlama" },
];

const stateFilters: Array<"Tümü" | VehicleState> = ["Tümü", "Yolda", "Riskte", "Beklemede", "Serviste"];

export default function PrototypePage() {
  const [filter, setFilter] = useState<(typeof stateFilters)[number]>("Tümü");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(vehicles[0].id);
  const [notice, setNotice] = useState("");
  const [resolvedAlerts, setResolvedAlerts] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return vehicles.filter((vehicle) => {
      const stateMatches = filter === "Tümü" || vehicle.state === filter;
      const queryMatches = !normalized || [vehicle.plate, vehicle.model, vehicle.driver, vehicle.route]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalized));
      return stateMatches && queryMatches;
    });
  }, [filter, query]);

  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? vehicles[0];
  const activeAlerts = alerts.filter((alert) => !resolvedAlerts.includes(alert.title));

  const sendAction = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>F</span>
          <div><strong>Filo</strong><small>kontrol merkezi</small></div>
        </div>
        <nav aria-label="Prototip bölümleri">
          <button className={styles.navActive}><span>01</span> Operasyon</button>
          <button><span>02</span> Araçlar</button>
          <button><span>03</span> Sürücüler</button>
          <button><span>04</span> Bakım</button>
          <button><span>05</span> Raporlar</button>
        </nav>
        <div className={styles.sidebarFoot}>
          <span>DEMO ÇALIŞMA ALANI</span>
          <strong>Marmara Lojistik</strong>
          <small>48 araç · 36 aktif sürücü</small>
          <Link href="/">Mevcut platforma dön →</Link>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>OPERASYON PROTOTİPİ · V1</span>
            <h1>Günaydın, Aydın</h1>
            <p>Filonun bugünkü akışı ve müdahale bekleyen konular.</p>
          </div>
          <div className={styles.topActions}>
            <div className={styles.liveStatus}><i /> Canlı bağlantı <strong>48/48</strong></div>
            <button className={styles.primaryButton} onClick={() => sendAction("Yeni görev taslağı oluşturuldu.")}>+ Yeni görev</button>
          </div>
        </header>

        {notice && <div className={styles.toast} role="status">✓ {notice}</div>}

        <section className={styles.metrics} aria-label="Günlük filo özeti">
          <article className={styles.metricLead}>
            <div><small>Aktif operasyon</small><strong>31</strong></div>
            <span>6 görev bugün tamamlandı</span>
            <progress value="31" max="40" aria-label="Aktif operasyon kapasitesi" />
          </article>
          <article><small>Zamanında teslimat</small><strong>%94,6</strong><span className={styles.positive}>↑ %2,4 geçen haftaya göre</span></article>
          <article><small>Riskteki araç</small><strong>3</strong><span className={styles.warning}>1 kritik müdahale</span></article>
          <article><small>Bugünkü mesafe</small><strong>4.820 km</strong><span>Ortalama 156 km / araç</span></article>
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.fleetPanel}>
            <header className={styles.panelHeader}>
              <div><h2>Canlı filo akışı</h2><p>Görevdeki araçları durum ve rotaya göre izleyin.</p></div>
              <label className={styles.searchBox}>
                <span>Ara</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Plaka, sürücü veya rota" />
              </label>
            </header>
            <div className={styles.filters} role="group" aria-label="Araç durum filtresi">
              {stateFilters.map((item) => <button key={item} className={filter === item ? styles.filterActive : ""} onClick={() => setFilter(item)}>{item}<small>{item === "Tümü" ? vehicles.length : vehicles.filter((vehicle) => vehicle.state === item).length}</small></button>)}
            </div>
            <div className={styles.vehicleList}>
              <div className={styles.listHead}><span>Araç / sürücü</span><span>Rota ilerleme</span><span>Durum</span><span>Varış</span></div>
              {filtered.length ? filtered.map((vehicle) => (
                <button key={vehicle.id} className={`${styles.vehicleRow} ${selected.id === vehicle.id ? styles.selectedRow : ""}`} onClick={() => setSelectedId(vehicle.id)}>
                  <span className={styles.vehicleIdentity}><b>{vehicle.plate}</b><small>{vehicle.model} · {vehicle.driver}</small></span>
                  <span className={styles.routeCell}><b>{vehicle.route}</b><span className={styles.progressTrack}><i style={{ width: `${vehicle.progress}%` }} /></span></span>
                  <span><i className={`${styles.stateDot} ${styles[`state${vehicle.state}`]}`} />{vehicle.state}<small>{vehicle.speed ? `${vehicle.speed} km/sa` : vehicle.lastSignal}</small></span>
                  <span><b>{vehicle.eta}</b><small>{vehicle.lastSignal}</small></span>
                </button>
              )) : <div className={styles.emptyState}>Bu filtreyle eşleşen araç bulunamadı.</div>}
            </div>
          </article>

          <aside className={styles.detailPanel}>
            <div className={styles.detailHeading}>
              <span>SEÇİLİ ARAÇ</span><i className={`${styles.statePill} ${styles[`pill${selected.state}`]}`}>{selected.state}</i>
              <h2>{selected.plate}</h2><p>{selected.model} · {selected.id}</p>
            </div>
            {selected.issue && <div className={styles.issueBox}><strong>Dikkat gerekiyor</strong><span>{selected.issue}</span></div>}
            <dl className={styles.vehicleFacts}>
              <div><dt>Sürücü</dt><dd>{selected.driver}</dd></div>
              <div><dt>Anlık hız</dt><dd>{selected.speed} km/sa</dd></div>
              <div><dt>Yakıt</dt><dd>%{selected.fuel}</dd></div>
              <div><dt>Tahmini varış</dt><dd>{selected.eta}</dd></div>
            </dl>
            <div className={styles.routeSummary}><span>Rota ilerleme</span><strong>%{selected.progress}</strong><progress value={selected.progress} max="100" /></div>
            <div className={styles.detailActions}>
              <button className={styles.primaryButton} onClick={() => sendAction(`${selected.driver} için operasyon görevi gönderildi.`)}>Görev gönder</button>
              <button onClick={() => sendAction(`${selected.plate} servis planına eklendi.`)}>Servis planla</button>
            </div>
            <button className={styles.textButton} onClick={() => sendAction(`${selected.plate} araç detay kaydı açıldı.`)}>Tüm araç detayını aç →</button>
          </aside>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.alertPanel}>
            <header className={styles.panelHeader}><div><h2>Müdahale kuyruğu</h2><p>Öncelik sırasına göre açık operasyon sinyalleri.</p></div><span className={styles.countBadge}>{activeAlerts.length} açık</span></header>
            <div className={styles.alertList}>
              {activeAlerts.length ? activeAlerts.map((alert) => <div key={alert.title}>
                <span className={`${styles.alertLevel} ${alert.level === "Kritik" ? styles.levelCritical : alert.level === "Uyarı" ? styles.levelWarning : styles.levelInfo}`}>{alert.level}</span>
                <p><strong>{alert.title}</strong><small>{alert.meta} · {alert.owner}</small></p>
                <button onClick={() => { setResolvedAlerts((items) => [...items, alert.title]); sendAction("Alarm incelendi olarak işaretlendi."); }}>İncelendi</button>
              </div>) : <div className={styles.allClear}>Tüm sinyaller incelendi. Operasyon kuyruğu temiz.</div>}
            </div>
          </article>
          <article className={styles.schedulePanel}>
            <header className={styles.panelHeader}><div><h2>Bugünün planı</h2><p>Yaklaşan teslimat ve bakım eşikleri.</p></div><button onClick={() => sendAction("Günlük plan görünümü açıldı.")}>Takvimi aç</button></header>
            <ol>
              <li><time>11:30</time><div><strong>Gebze dağıtım penceresi</strong><span>7 araç · 12 teslimat</span></div></li>
              <li><time>13:45</time><div><strong>Lastik kontrol grubu</strong><span>3 araç · İkitelli servis</span></div></li>
              <li><time>16:20</time><div><strong>Akşam vardiyası devri</strong><span>9 sürücü · Operasyon masası</span></div></li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
