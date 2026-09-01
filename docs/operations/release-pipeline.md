# CI/CD ve yayın güvenlik hattı

`.github/workflows/release-gates.yml`, ana dala gönderilen ve pull request olarak açılan her değişiklikte aşağıdaki bağımsız kapıları çalıştırır:

1. Repository secret taraması ve tracked `.env` engeli.
2. Drizzle migration sıra/journal ve yıkıcı SQL kontrolü.
3. ESLint ve TypeScript strict type-check.
4. Üretim build'i ve 55+ iş akışı testi.
5. Kaynak ve build SHA-256 manifestosu.
6. CycloneDX SBOM.
7. Yüksek/kritik bağımlılık güvenlik denetimi.
8. GitHub CodeQL JavaScript/TypeScript analizi.
9. Pull request dependency review.
10. İki ardışık build'in içerik özeti karşılaştırması. Vinext'in güvenlik için her build'de ürettiği draft/build UUID ve prerender secret değerleri kontrollü olarak normalize edilir; diğer bütün dosyalar birebir karşılaştırılır.

Her zorunlu job başarılı olmadan ana dal koruması değişikliği birleştirmemelidir. GitHub repository ayarlarında `Filo release gates` kontrolleri required status checks olarak işaretlenmeli, doğrudan push kapatılmalı ve en az bir onay istenmelidir.

`outputs/` içine yazılan SBOM, release manifest ve reproducibility raporu CI artifact'i olarak 30 gün saklanır. Bu artifact dış penetrasyon, hukuk, fiziksel cihaz veya pilot kanıtının yerine geçmez.

Yerel eşdeğer kontrol:

```bash
npm run ci:verify
npm run build:reproducible
```
