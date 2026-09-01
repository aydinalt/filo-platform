# Teknik canlıya geçiş — 2–15

Hukuk/KVKK kapısı kullanıcı kararıyla ertelenmiştir. Bu erteleme genel yayına izin vermez; `PUBLIC_SIGNUP_ENABLED=false` kalır.

## Sıra

1. Üretim ortamı ve izolasyon
2. Canlı sağlayıcı hesapları
3. Harita ve geocoding
4. Telefon saha matrisi
5. Fiziksel takip cihazı saha testi
6. Sağlayıcı yaşam döngüleri
7. Veri göçü
8. Yedek ve geri dönüş
9. Gözlemlenebilirlik ve operasyon
10. Bağımsız güvenlik ve yük testi
11. Pilot UAT
12. Mobil mağaza süreçleri
13. Kapasite ve maliyet
14. Kontrollü kademeli yayın

## Komutlar

```bash
npm run technical:readiness
npm run capacity:verify
npm run synthetic:production -- --base-url=https://example.invalid
npm run technical:readiness:strict -- --manifest=/secure/path/real-evidence.json
```

Şablonların bulunması yazılım hazırlığını kanıtlar; gerçek hesap, cihaz, test ve onay kanıtlarının yerine geçmez.
