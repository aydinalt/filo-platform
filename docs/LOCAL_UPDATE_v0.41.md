# Filo Platform V1 v0.41

## Kapsam

- Sunucu veya süreç kesintisi nedeniyle `running` durumda kalan gecikmiş uzlaştırma hatırlatma taramaları güvenli biçimde kapatılıyor.
- 15 dakikayı aşan yarım kalmış taramalar `failed` durumuna ve sınırlı `REMINDER_SCAN_INTERRUPTED` sonuç koduna geçiriliyor.
- Her kapatılan yarım tarama için tenant sınırında audit kaydı oluşturuluyor.
- Ham hata metni saklanmıyor.
- Otomatik yeniden deneme, fiziksel silme veya yeni bildirim kanalı eklenmedi.

## Veritabanı

Yeni migration gerekmez. v0.40 içindeki `039_notification_archive_reconciliation_reminder_run_lifecycle.sql` şeması ve indeksi yeterlidir.

## Doğrulama

- TypeScript doğrulaması başarılı.
- API testleri başarılı.
- API ve web production derlemeleri başarılı.
