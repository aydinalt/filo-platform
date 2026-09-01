# Filo Telematics Gateway v1.28.11

Bu servis, raw TCP GPS cihazlarını Vercel/Sites çalışma zamanının dışında karşılar.
Teltonika Codec 8/8E paketlerinde IMEI, CRC ve kayıt sayısını doğrular; MQTT TLS
üzerinde QoS 1 ve `retain=false` ile kuyruğa verir. Ayrı MQTT bridge, normalize
paketini cihaz tokenı ve HMAC-SHA256 ile `/api/tracker-gateway` yoluna iletir.

Pilot adayları Teltonika FMC920 ve Queclink GV57MG Plus'tır. Queclink ayrıştırıcısı
alan indekslerini tahmin etmez: satın alınan cihazın firmware sürümüne ait lisanslı
@Track protokol belgesiyle `vendorProfile.status=APPROVED` ve alan eşlemesi
verilmeden paket reddedilir.

1. `gateway.devices.example.json` dosyasını gizli bir konuma kopyalayın ve panelden
   üretilen gerçek cihaz tokenlarını girin.
2. MQTT broker için `mqtts://`, sunucu CA doğrulaması ve tercihen istemci
   sertifikası ayarlayın.
3. `npm install` ardından TCP katmanını `npm run start:tcp`, MQTT tüketicisini
   ayrı süreçte `npm run start:mqtt-bridge` ile çalıştırın.
4. TCP 5027/5028 portlarını yalnız cihaz/SIM ağlarından kabul edin; panel veya
   Supabase portlarını internete açmayın.

Gerçek cihaz, SIM, broker, sabit IP/firewall ve 8–12 saatlik saha kanıtı olmadan
bu kaynak kodu canlı entegrasyon kanıtı sayılmaz.
