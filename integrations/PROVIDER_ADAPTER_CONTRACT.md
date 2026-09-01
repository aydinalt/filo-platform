# Filo Platform v1.21 — Sağlayıcı adaptör sözleşmesi

Bu belge, ödeme ve e-belge sağlayıcısından bağımsız sunucu sözleşmesini tanımlar. Gerçek sağlayıcı seçilmeden bir paket aktif, e-belge düzenlenmiş veya bildirim teslim edilmiş sayılmaz.

## Ortak güvenlik

- Tüm adaptör adresleri genel `https://` adresi olmalıdır; yerel/özel ağ adresleri reddedilir.
- Her istek `Authorization: Bearer …`, `Idempotency-Key` ve `X-Filo-Contract` başlıklarıyla gönderilir.
- Callback şu başlıkları taşır: `x-filo-provider`, `x-filo-event-id`, `x-filo-timestamp`, `x-filo-signature`.
- İmza: `hex(HMAC-SHA256(secret, timestamp + "." + rawBody))`.
- Callback zaman penceresi 5 dakikadır. Sağlayıcı + olay kimliği D1 üzerinde tekilleştirilir.

## Ödeme — `FILO_PAYMENT_V1`

Gerekli ortam değişkenleri: `PAYMENT_API_URL`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_CHECKOUT_HOSTS`, isteğe bağlı `PAYMENT_PROVIDER_NAME`.

İstek alanları: `tenantId`, `orderId`, `plan`, `period`, `seats`, `vehicles`, `amountMinor`, `currency`, `customer`, `callbackUrl`, `returnUrls`.

Başarılı adaptör yanıtı:

```json
{ "providerReference": "pay_123", "checkoutUrl": "https://pay.example/checkout/123" }
```

Callback gövdesi:

```json
{ "tenantId": "TEN-…", "orderId": "SUB-…", "providerReference": "pay_123", "status": "COMPLETED" }
```

Durumlar: `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`. Paket yalnız `COMPLETED` callback’iyle aktifleşir. Son aktif ödeme de iade edilmişse plan `FREE` olur.

## E-belge — `FILO_EDOCUMENT_V1`

Gerekli ortam değişkenleri: `EINVOICE_API_URL`, `EINVOICE_API_KEY`, `EINVOICE_WEBHOOK_SECRET`, isteğe bağlı `EINVOICE_PROVIDER_NAME`.

İstek; kaynak teklif, onaylı satıcı hukuk profili, alıcı vergi kimliği, ülke, para birimi, net/vergi/brüt kuruş toplamları, tek hizmet satırı ve callback adresi taşır. Yalnız onaylı/kazanılmış teklif gönderilir.

Başarılı adaptör yanıtı:

```json
{ "providerReference": "doc_123" }
```

Callback durumları: `ACCEPTED`, `REJECTED`, `CANCELLED`. Belge yalnız `ACCEPTED` callback’iyle düzenlenmiş kabul edilir.

## E-posta — Resend

Gerekli ortam değişkenleri: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_FROM`.

- Gönderim `Idempotency-Key: filo-{outboxEventId}` ile doğrudan Resend API’ye yapılır.
- Resend/Svix webhook adresi `/api/resend-webhook` olmalıdır.
- `email.delivered` teslim, `email.bounced`, `email.failed`, `email.complained`, `email.suppressed` hata olarak kaydedilir.
- `email.sent` ve `email.delivery_delayed` teslim edilmiş sayılmaz.

## Push — Expo Push Service

Gerekli ortam değişkenleri: `EXPO_ACCESS_TOKEN`, `EXPO_PROJECT_ID`.

- Native uygulama bildirim izni ister ve `ExpoPushToken` değerini cihaz kaydında sunucuya gönderir.
- Push bileti `RECEIPT_PENDING`, Expo receipt sonucu `DELIVERED` veya `FAILED` olur.
- `DeviceNotRegistered` sonucu cihaz tokenını geçersizleştirir.
- Hatalar üstel gecikmeyle tekrar denenir; aynı outbox/kanal/alıcı için tek teslimat kimliği korunur.
