# Filo Sürücü — native iOS/Android kaynak paketi

Bu klasör, Filo Platform v1.28.10 mobil çalışma zamanı sözleşmesine bağlanan Expo/React Native kaynak paketidir. Web prototipi mobil uygulama gibi davranmaz; bu kod fiziksel iPhone ve Android cihazlarda development/internal build olarak çalıştırılmalıdır.

## Kurulum

1. Güncel Expo SDK ile boş TypeScript proje oluşturun: `npx create-expo-app@latest filo-driver`.
2. `App.tsx`, `app.config.ts` ve `src/driver-runtime.ts` dosyalarını projeye kopyalayın.
3. Sürümleri Expo SDK ile eşleştirerek kurun:
   `npx expo install expo-location expo-task-manager expo-secure-store @react-native-async-storage/async-storage expo-device expo-application expo-notifications expo-constants expo-battery expo-network`
4. `npx expo prebuild` çalıştırın; ardından EAS development build üretin. Arka plan konumu Expo Go içinde doğrulanamaz.
5. Panelde Cihaz Envanteri > telefon kaydı oluşturun, Sürücü Uygulaması ekranından tek kullanımlık kurulum profilini üretin ve uygulamaya girin.

## Güvenlik ve işletim kuralları

- Cihaz anahtarı yalnız SecureStore içinde tutulur; günlük veya hata çıktısına yazılmaz.
- Takip, onaylı hukuk profili ve tebliğ edilmiş konum bildirimi olmadan sunucuda başlatılamaz.
- iOS için `Always`, Android için foreground + background konum ve aktif foreground service gereklidir.
- Her nokta gerçek pil yüzdesi ve aktif `sessionId` ile gönderilir. Çevrimdışı kayıtlar 10.000 öğelik dayanıklı kuyruğa alınır; aynı `capturedAt` ile tekrar gönderildiğinde sunucuda tekilleştirilir.
- Kuyruk gönderimi ilk ağ hatasında durur; sonraki kayıtları öne geçirerek zaman sırasını bozmaz. Kuyruk büyümesi, geri oynatma, geç telemetri ve taşma olayları sunucuya tanılama kanıtı olarak yazılır.
- Kullanıcının uygulamayı zorla sonlandırması işletim sistemi seviyesinde garanti edilemez ve hiçbir zaman `PASSED` sayılmaz. iOS `USER_TERMINATED`, Android `FORCE_STOP` sonucu yalnız `LIMIT_DOCUMENTED` olabilir.
- Ekran kilitli/arka plan çalışması, yeniden başlatma, OEM pil optimizasyonu, çevrimdışı geri gönderim ve 8 saat pil ölçümü fiziksel cihaz matrisinde ayrı koşulur.

Resmî teknik dayanaklar:

- https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- https://developer.android.com/develop/sensors-and-location/location/permissions
- https://developer.android.com/develop/background-work/services/fgs/service-types
- https://docs.expo.dev/versions/latest/sdk/location/
- https://docs.expo.dev/versions/latest/sdk/task-manager/
