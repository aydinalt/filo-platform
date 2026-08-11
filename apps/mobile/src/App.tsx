import { useEffect, useState } from "react";
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "react-native";
import type { MobilePrincipal } from "@filo/contracts";
import { mobileApi } from "./api";
import { flushLocationQueue, startBackgroundTracking, stopBackgroundTracking } from "./background-location";
import { credentialStore, readQueue } from "./storage";

export default function App() {
  const [credential, setCredential] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<MobilePrincipal | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [deviceName, setDeviceName] = useState(`${Platform.OS} telefon`);
  const [status, setStatus] = useState("Hazır");
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    void credentialStore.read().then(async (stored) => {
      if (!stored) return;
      try {
        const result = await mobileApi.me(stored);
        setCredential(stored);
        setPrincipal(result.principal);
      } catch {
        await credentialStore.clear();
      }
      setQueued((await readQueue()).length);
    });
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } catch (error) {
      setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    } finally { setBusy(false); }
  }

  async function claim() {
    const result = await mobileApi.claim({
      token: enrollmentToken.trim(),
      platform: Platform.OS === "ios" ? "ios" : "android",
      deviceName: deviceName.trim(),
    });
    await credentialStore.write(result.credential);
    setCredential(result.credential);
    setPrincipal(result.principal);
    setEnrollmentToken("");
    setStatus("Telefon güvenle kaydedildi.");
  }

  async function start() {
    if (!credential) return;
    await mobileApi.startShift(credential);
    await startBackgroundTracking();
    await mobileApi.tracking(credential, { permission: "granted_always", state: "tracking" });
    setStatus("Vardiya ve arka plan konum paylaşımı aktif.");
  }

  async function stop() {
    if (!credential) return;
    await stopBackgroundTracking();
    await flushLocationQueue();
    await mobileApi.tracking(credential, { permission: "granted_always", state: "paused" });
    await mobileApi.endShift(credential);
    setQueued((await readQueue()).length);
    setStatus("Vardiya kapatıldı; konum paylaşımı durdu.");
  }

  async function sync() {
    const result = await flushLocationQueue();
    setQueued(result.queued);
    setStatus(`${result.sent} konum gönderildi, ${result.queued} konum bekliyor.`);
  }

  async function forget() {
    await stopBackgroundTracking();
    await credentialStore.clear();
    setCredential(null);
    setPrincipal(null);
    setStatus("Bu telefondaki erişim bilgisi temizlendi.");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>Filo Sürücü</Text>
        <Text style={styles.title}>{principal ? principal.vehiclePlate : "Telefonunuzu kaydedin"}</Text>
        <Text style={styles.subtitle}>{principal ? `${principal.driverName} · ${principal.deviceName}` : "Yöneticinizin oluşturduğu 15 dakikalık kayıt kodunu kullanın."}</Text>

        {!principal ? <View style={styles.card}>
          <Text style={styles.label}>Kayıt kodu</Text>
          <TextInput style={styles.input} value={enrollmentToken} onChangeText={setEnrollmentToken} autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.label}>Cihaz adı</Text>
          <TextInput style={styles.input} value={deviceName} onChangeText={setDeviceName} maxLength={100} />
          <Button label="Telefonu kaydet" disabled={busy || enrollmentToken.length < 40 || deviceName.trim().length < 2} onPress={() => run(claim)} />
        </View> : <View style={styles.card}>
          <Text style={styles.info}>Konum yalnız aktif vardiya sırasında gönderilir. Çevrimdışı noktalar cihazda sıraya alınır ve bağlantı geri geldiğinde idempotent olarak eşitlenir.</Text>
          <Button label="Vardiyayı ve takibi başlat" disabled={busy} onPress={() => run(start)} />
          <Button label="Takibi durdur ve vardiyayı kapat" secondary disabled={busy} onPress={() => run(stop)} />
          <Button label={`Bekleyenleri eşitle (${queued})`} secondary disabled={busy} onPress={() => run(sync)} />
          <Button label="Bu telefondaki kaydı temizle" danger disabled={busy} onPress={() => run(forget)} />
        </View>}

        <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled, secondary, danger }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean;
}) {
  return <Pressable disabled={disabled} onPress={onPress} style={[
    styles.button, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled,
  ]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#08111f" },
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  brand: { color: "#67d6c0", fontSize: 16, fontWeight: "800", marginBottom: 28 },
  title: { color: "#ffffff", fontSize: 32, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#9faec3", fontSize: 16, lineHeight: 24, marginBottom: 24 },
  card: { backgroundColor: "#ffffff", borderRadius: 18, padding: 22, gap: 12 },
  label: { color: "#314057", fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#d5dce7", borderRadius: 10, padding: 13, color: "#172033" },
  info: { color: "#526174", lineHeight: 21, marginBottom: 8 },
  button: { backgroundColor: "#117d6b", borderRadius: 10, padding: 15, alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "800" },
  secondary: { backgroundColor: "#e9eef4" },
  secondaryText: { color: "#273449" },
  danger: { backgroundColor: "#b42318" },
  disabled: { opacity: 0.5 },
  status: { borderWidth: 1, borderColor: "#22344c", borderRadius: 12, padding: 16, marginTop: 18 },
  statusText: { color: "#a9d5cc", lineHeight: 20 },
});
