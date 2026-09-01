# Filo takip cihazı HTTP köprüsü

Filo Sites dağıtımı raw TCP soketi dinlemez. Bu bağımsız Node.js köprüsü, cihazın TCP verisini sahada/VPS üzerinde alır ve Filo Platform `/api/tracker-gateway` uç noktasına HMAC-SHA256 imzalı HTTPS paketi gönderir.

## Destek kapsamı

- Teltonika Codec 8 (`0x08`) ve Codec 8 Extended (`0x8E`): IMEI el sıkışması, CRC-16/IBM doğrulaması, temel GNSS alanları, IO blok atlama ve yalnız başarılı HTTPS kabulünden sonra kayıt adedi ACK.
- Queclink: model/protokol sürümüne ait alan indeksleri `QUECLINK_PROFILE_JSON` ile açıkça verilmeden paket kabul edilmez. Böylece farklı GV/GL firmware formatları yanlış koordinata çevrilmez.
- Her süreç tek cihaz anahtarıyla çalışır. Çok cihazlı kurulumda cihaz başına izole süreç/container önerilir.

## Çalıştırma

Node.js 22+ ile:

```text
FILO_API_BASE=https://filo-platform-prototip.aydinalt.chatgpt.site
FILO_DEVICE_TOKEN=panelde-bir-kez-gosterilen-anahtar
FILO_PROVIDER=TELTONIKA
FILO_PROTOCOL=CODEC8E
FILO_VEHICLE_ID=34 ABC 123
LISTEN_PORT=5027
node index.mjs
```

Queclink için üretici/protokol belgesindeki sıfır tabanlı CSV indeksleri ayrıca verilir:

```text
FILO_PROVIDER=QUECLINK
FILO_PROTOCOL=GV_PROFILE_1
QUECLINK_PROFILE_JSON={"timestamp":4,"longitude":11,"latitude":12,"speed":8,"heading":9,"altitude":10}
```

İnternet kesilmesi halinde köprü paketi cihaz tarafında ACK etmez; cihazın kendi yeniden gönderim davranışı devreye girer. Üretimde TLS sonlandırma, IP allowlist, servis yöneticisi, disk spool, metrik ve alarm ayrıca kurulmalıdır.

Resmî Teltonika protokol kaynağı: https://wiki.teltonika-gps.com/view/Codec
