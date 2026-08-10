# Filo Platform V1 v0.40

## Kapsam

- Gecikmiş uzlaştırma hatırlatma taramalarına `running`, `succeeded` ve `failed` yaşam döngüsü eklendi.
- Başlangıç ve tamamlanma zamanları operasyon geçmişinde görünür hale getirildi.
- Başarısız taramalar ham hata metni yerine sınırlı bir sonuç koduyla kaydediliyor.
- Aynı tenant için eşzamanlı tarama reddi geçmişte görünür hale getirildi.
- Worker ve manuel API başarısız taramada HTTP 503 döndürüyor.
- Otomatik yeniden deneme, fiziksel silme veya yeni bildirim kanalı eklenmedi.

## Veritabanı

`packages/database/migrations/039_notification_archive_reconciliation_reminder_run_lifecycle.sql`

## Doğrulama

- TypeScript doğrulaması başarılı.
- 45 test başarılı.
- API ve web production derlemeleri başarılı.

## Migration sırası

Mevcut v0.39 veritabanında `039_notification_archive_reconciliation_reminder_run_lifecycle.sql` migration'ını çalıştırın.
