const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');

const keysToInject = {
    'ide.already_running_short': {
        en: 'Antigravity IDE is already running (PID: {pid})',
        tr: 'Antigravity IDE zaten çalışıyor (PID: {pid})',
        de: 'Antigravity IDE läuft bereits (PID: {pid})',
        fr: "L'IDE Antigravity est déjà en cours d'exécution (PID: {pid})",
        es: 'El IDE de Antigravity ya se está ejecutando (PID: {pid})'
    },
    'menu.model_not_selected': {
        en: '⚠️ No model selected',
        tr: '⚠️ Model seçilmedi',
        de: '⚠️ Kein Modell ausgewählt',
        fr: '⚠️ Aucun modèle sélectionné',
        es: '⚠️ Ningún modelo seleccionado'
    },
    'shortcuts.unsupported_platform': {
        en: 'Shortcuts are only supported on macOS.',
        tr: 'Kısayollar sadece macOS üzerinde desteklenmektedir.',
        de: 'Tastenkombinationen werden nur unter macOS unterstützt.',
        fr: 'Les raccourcis ne sont pris en charge que sur macOS.',
        es: 'Los atajos solo son compatibles con macOS.'
    },
    'window.selected_toast': {
        en: 'Selected Window: {title}',
        tr: 'Seçili Pencere: {title}',
        de: 'Ausgewähltes Fenster: {title}',
        fr: 'Fenêtre sélectionnée : {title}',
        es: 'Ventana seleccionada: {title}'
    },
    'agents.window_not_found': {
        en: 'Agent window not found',
        tr: 'Agent penceresi bulunamadı',
        de: 'Agent-Fenster nicht gefunden',
        fr: "Fenêtre d'agent introuvable",
        es: 'Ventana de agente no encontrada'
    },
    'schedule.not_configured': {
        en: '⚠️ CronCrew is not configured yet.\\n\\nSetup: /schedule_setup <server_url> <license_key>\\nExample: /schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX',
        tr: '⚠️ CronCrew henüz yapılandırılmadı.\\n\\nKurulum: /schedule_setup <sunucu_url> <lisans_anahtari>\\nÖrnek: /schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX',
        de: '⚠️ CronCrew ist noch nicht konfiguriert.\\n\\nSetup: /schedule_setup <server_url> <lizenzschluessel>\\nBeispiel: /schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX',
        fr: '⚠️ CronCrew n’est pas encore configuré.\\n\\nInstallation : /schedule_setup <url_serveur> <clé_licence>\\nExemple : /schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX',
        es: '⚠️ CronCrew aún no está configurado.\\n\\nConfiguración: /schedule_setup <url_servidor> <clave_licencia>\\nEjemplo: /schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX'
    },
    'schedule.setup_usage': {
        en: '⚙️ Usage: /schedule_setup <server_url> <license_key>\\n\\nExample:\\n<code>/schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX</code>',
        tr: '⚙️ Kullanım: /schedule_setup <sunucu_url> <lisans_anahtari>\\n\\nÖrnek:\\n<code>/schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX</code>',
        de: '⚙️ Verwendung: /schedule_setup <server_url> <lizenzschluessel>\\n\\nBeispiel:\\n<code>/schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX</code>',
        fr: '⚙️ Utilisation : /schedule_setup <url_serveur> <clé_licence>\\n\\nExemple :\\n<code>/schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX</code>',
        es: '⚙️ Uso: /schedule_setup <url_servidor> <clave_licencia>\\n\\nEjemplo:\\n<code>/schedule_setup https://agp.emreturkmen.com CC-XXXX-XXXX-XXXX-XXXX</code>'
    },
    'schedule.setup_success': {
        en: '✅ CronCrew connected!\\n\\n🎫 Tier: <b>{tier}</b>\\n📡 Server: <code>{url}</code>\\n\\nUse /schedule_list to manage your schedules.',
        tr: '✅ CronCrew bağlandı!\\n\\n🎫 Seviye: <b>{tier}</b>\\n📡 Sunucu: <code>{url}</code>\\n\\nZamanlamalarınızı yönetmek için /schedule_list kullanın.',
        de: '✅ CronCrew verbunden!\\n\\n🎫 Stufe: <b>{tier}</b>\\n📡 Server: <code>{url}</code>\\n\\nVerwenden Sie /schedule_list, um Ihre Zeitpläne zu verwalten.',
        fr: '✅ CronCrew connecté !\\n\\n🎫 Niveau : <b>{tier}</b>\\n📡 Serveur : <code>{url}</code>\\n\\nUtilisez /schedule_list pour gérer vos planifications.',
        es: '✅ ¡CronCrew conectado!\\n\\n🎫 Nivel: <b>{tier}</b>\\n📡 Servidor: <code>{url}</code>\\n\\nUsa /schedule_list para gestionar tus horarios.'
    },
    'schedule.setup_error': {
        en: '❌ Connection error: {error}',
        tr: '❌ Bağlantı hatası: {error}',
        de: '❌ Verbindungsfehler: {error}',
        fr: '❌ Erreur de connexion : {error}',
        es: '❌ Error de conexión: {error}'
    },
    'schedule.status_title': {
        en: '📊 <b>CronCrew Status</b>\\n\\n',
        tr: '📊 <b>CronCrew Durumu</b>\\n\\n',
        de: '📊 <b>CronCrew Status</b>\\n\\n',
        fr: '📊 <b>Statut de CronCrew</b>\\n\\n',
        es: '📊 <b>Estado de CronCrew</b>\\n\\n'
    },
    'schedule.status_tier': {
        en: '🎫 Tier: <b>{tier}</b>\\n',
        tr: '🎫 Seviye: <b>{tier}</b>\\n',
        de: '🎫 Stufe: <b>{tier}</b>\\n',
        fr: '🎫 Niveau : <b>{tier}</b>\\n',
        es: '🎫 Nivel: <b>{tier}</b>\\n'
    },
    'schedule.status_license': {
        en: '📋 Status: <b>{status}</b>\\n',
        tr: '📋 Durum: <b>{status}</b>\\n',
        de: '📋 Status: <b>{status}</b>\\n',
        fr: '📋 Statut : <b>{status}</b>\\n',
        es: '📋 Estado: <b>{status}</b>\\n'
    },
    'schedule.status_usage': {
        en: '📈 Today: {today} executions\\n',
        tr: '📈 Bugün: {today} yürütme\\n',
        de: '📈 Heute: {today} Ausführungen\\n',
        fr: '📈 Aujourd’hui : {today} exécutions\\n',
        es: '📈 Hoy: {today} ejecuciones\\n'
    },
    'schedule.status_schedules': {
        en: '📅 Active Schedules: {count}\\n',
        tr: '📅 Aktif Zamanlamalar: {count}\\n',
        de: '📅 Aktive Zeitpläne: {count}\\n',
        fr: '📅 Planifications actives : {count}\\n',
        es: '📅 Horarios activos: {count}\\n'
    },
    'schedule.status_changes': {
        en: '🔄 Device Changes: {used}/{max}\\n',
        tr: '🔄 Cihaz Değişimleri: {used}/{max}\\n',
        de: '🔄 Gerätewechsel: {used}/{max}\\n',
        fr: '🔄 Changements d’appareil : {used}/{max}\\n',
        es: '🔄 Cambios de dispositivo: {used}/{max}\\n'
    },
    'schedule.status_expires': {
        en: '⏰ Expires: {date}\\n',
        tr: '⏰ Bitiş: {date}\\n',
        de: '⏰ Läuft ab: {date}\\n',
        fr: '⏰ Expire : {date}\\n',
        es: '⏰ Caduca: {date}\\n'
    },
    'schedule.list_title': {
        en: '📅 <b>Schedule List:</b>\\n\\n',
        tr: '📅 <b>Zamanlama Listesi:</b>\\n\\n',
        de: '📅 <b>Zeitplanliste:</b>\\n\\n',
        fr: '📅 <b>Liste des planifications :</b>\\n\\n',
        es: '📅 <b>Lista de horarios:</b>\\n\\n'
    },
    'schedule.list_empty': {
        en: 'ℹ️ No schedules created yet.\\n\\nUse /schedule_add to create a new schedule.',
        tr: 'ℹ️ Henüz hiç zamanlama oluşturulmadı.\\n\\nYeni bir zamanlama oluşturmak için /schedule_add kullanın.',
        de: 'ℹ️ Noch keine Zeitpläne erstellt.\\n\\nVerwenden Sie /schedule_add, um einen neuen Zeitplan zu erstellen.',
        fr: 'ℹ️ Aucune planification créée pour le moment.\\n\\nUtilisez /schedule_add pour créer une nouvelle planification.',
        es: 'ℹ️ Aún no hay horarios creados.\\n\\nUsa /schedule_add para crear un nuevo horario.'
    },
    'schedule.list_item': {
        en: '{icon} <b>{name}</b>\\n   ⏰ <code>{cron}</code> → {workspace}\\n   📊 Ran {runCount}x | Last: {lastResult}\\n',
        tr: '{icon} <b>{name}</b>\\n   ⏰ <code>{cron}</code> → {workspace}\\n   📊 Çalışma: {runCount}x | Son: {lastResult}\\n',
        de: '{icon} <b>{name}</b>\\n   ⏰ <code>{cron}</code> → {workspace}\\n   📊 Ausgeführt: {runCount}x | Letzte: {lastResult}\\n',
        fr: '{icon} <b>{name}</b>\\n   ⏰ <code>{cron}</code> → {workspace}\\n   📊 Exécuté : {runCount}x | Dernier : {lastResult}\\n',
        es: '{icon} <b>{name}</b>\\n   ⏰ <code>{cron}</code> → {workspace}\\n   📊 Ejecutado: {runCount}x | Último: {lastResult}\\n'
    },
    'schedule.add_usage': {
        en: '➕ Add a new schedule:\\n\\n<code>/schedule_add Name | cron_expression | workspace | prompt</code>\\n\\nExample:\\n<code>/schedule_add Daily Test | 0 9 * * * | antigravity-bot | Run all tests</code>',
        tr: '➕ Yeni zamanlama ekle:\\n\\n<code>/schedule_add İsim | cron_ifadesi | çalışma_alanı | istem</code>\\n\\nÖrnek:\\n<code>/schedule_add Günlük Test | 0 9 * * * | antigravity-bot | Tüm testleri çalıştır</code>',
        de: '➕ Neuen Zeitplan hinzufügen:\\n\\n<code>/schedule_add Name | cron_ausdruck | arbeitsbereich | prompt</code>\\n\\nBeispiel:\\n<code>/schedule_add Täglicher Test | 0 9 * * * | antigravity-bot | Alle Tests ausführen</code>',
        fr: '➕ Ajouter une nouvelle planification :\\n\\n<code>/schedule_add Nom | expression_cron | espace_de_travail | prompt</code>\\n\\nExemple :\\n<code>/schedule_add Test quotidien | 0 9 * * * | antigravity-bot | Exécuter tous les tests</code>',
        es: '➕ Agregar un nuevo horario:\\n\\n<code>/schedule_add Nombre | expresion_cron | espacio_de_trabajo | prompt</code>\\n\\nEjemplo:\\n<code>/schedule_add Prueba diaria | 0 9 * * * | antigravity-bot | Ejecutar todas las pruebas</code>'
    },
    'schedule.add_success': {
        en: '✅ Schedule created!\\n\\n📝 <b>{name}</b>\\n⏰ <code>{cron}</code>\\n📁 {workspace}\\n🤖 {model}',
        tr: '✅ Zamanlama oluşturuldu!\\n\\n📝 <b>{name}</b>\\n⏰ <code>{cron}</code>\\n📁 {workspace}\\n🤖 {model}',
        de: '✅ Zeitplan erstellt!\\n\\n📝 <b>{name}</b>\\n⏰ <code>{cron}</code>\\n📁 {workspace}\\n🤖 {model}',
        fr: '✅ Planification créée !\\n\\n📝 <b>{name}</b>\\n⏰ <code>{cron}</code>\\n📁 {workspace}\\n🤖 {model}',
        es: '✅ ¡Horario creado!\\n\\n📝 <b>{name}</b>\\n⏰ <code>{cron}</code>\\n📁 {workspace}\\n🤖 {model}'
    },
    'schedule.add_error': {
        en: '❌ Creation error: {error}',
        tr: '❌ Oluşturma hatası: {error}',
        de: '❌ Erstellungsfehler: {error}',
        fr: '❌ Erreur de création : {error}',
        es: '❌ Error de creación: {error}'
    },
    'schedule.delete_usage': {
        en: '🗑️ Delete a schedule:\\n\\n<code>/schedule_del <schedule_id></code>',
        tr: '🗑️ Zamanlamayı sil:\\n\\n<code>/schedule_del <zamanlama_id></code>',
        de: '🗑️ Zeitplan löschen:\\n\\n<code>/schedule_del <zeitplan_id></code>',
        fr: '🗑️ Supprimer une planification :\\n\\n<code>/schedule_del <id_planification></code>',
        es: '🗑️ Eliminar un horario:\\n\\n<code>/schedule_del <id_horario></code>'
    },
    'schedule.delete_success': {
        en: '✅ Schedule deleted.',
        tr: '✅ Zamanlama silindi.',
        de: '✅ Zeitplan gelöscht.',
        fr: '✅ Planification supprimée.',
        es: '✅ Horario eliminado.'
    },
    'schedule.delete_error': {
        en: '❌ Deletion error: {error}',
        tr: '❌ Silme hatası: {error}',
        de: '❌ Löschfehler: {error}',
        fr: '❌ Erreur de suppression : {error}',
        es: '❌ Error de eliminación: {error}'
    },
    'schedule.pause_success': {
        en: '⏸️ Schedule paused: <b>{name}</b>',
        tr: '⏸️ Zamanlama duraklatıldı: <b>{name}</b>',
        de: '⏸️ Zeitplan pausiert: <b>{name}</b>',
        fr: '⏸️ Planification en pause : <b>{name}</b>',
        es: '⏸️ Horario pausado: <b>{name}</b>'
    },
    'schedule.resume_success': {
        en: '▶️ Schedule resumed: <b>{name}</b>',
        tr: '▶️ Zamanlama devam ettirildi: <b>{name}</b>',
        de: '▶️ Zeitplan fortgesetzt: <b>{name}</b>',
        fr: '▶️ Planification reprise : <b>{name}</b>',
        es: '▶️ Horario reanudado: <b>{name}</b>'
    },
    'schedule.run_success': {
        en: '🚀 Schedule executed!\\n\\n📁 Workspace: <b>{workspace}</b>\\n🤖 Model: {model}\\n📝 Prompt sent.',
        tr: '🚀 Zamanlama çalıştırıldı!\\n\\n📁 Çalışma Alanı: <b>{workspace}</b>\\n🤖 Model: {model}\\n📝 İstem gönderildi.',
        de: '🚀 Zeitplan ausgeführt!\\n\\n📁 Arbeitsbereich: <b>{workspace}</b>\\n🤖 Modell: {model}\\n📝 Prompt gesendet.',
        fr: '🚀 Planification exécutée !\\n\\n📁 Espace de travail : <b>{workspace}</b>\\n🤖 Modèle : {model}\\n📝 Invite envoyée.',
        es: '🚀 ¡Horario ejecutado!\\n\\n📁 Espacio de trabajo: <b>{workspace}</b>\\n🤖 Modelo: {model}\\n📝 Prompt enviado.'
    },
    'schedule.run_error': {
        en: '❌ Execution error: {error}',
        tr: '❌ Çalıştırma hatası: {error}',
        de: '❌ Ausführungsfehler: {error}',
        fr: '❌ Erreur d’exécution : {error}',
        es: '❌ Error de ejecución: {error}'
    },
    'schedule.error': {
        en: '❌ Error: {error}',
        tr: '❌ Hata: {error}',
        de: '❌ Fehler: {error}',
        fr: '❌ Erreur : {error}',
        es: '❌ Error: {error}'
    },
    'schedule.btn_pause': {
        en: '⏸️ Pause',
        tr: '⏸️ Duraklat',
        de: '⏸️ Pause',
        fr: '⏸️ Pause',
        es: '⏸️ Pausar'
    },
    'schedule.btn_resume': {
        en: '▶️ Resume',
        tr: '▶️ Devam Et',
        de: '▶️ Fortsetzen',
        fr: '▶️ Reprendre',
        es: '▶️ Reanudar'
    },
    'schedule.btn_delete': {
        en: '🗑️ Delete',
        tr: '🗑️ Sil',
        de: '🗑️ Löschen',
        fr: '🗑️ Supprimer',
        es: '🗑️ Eliminar'
    },
    'schedule.btn_run': {
        en: '▶️ Run Now',
        tr: '▶️ Şimdi Çalıştır',
        de: '▶️ Jetzt ausführen',
        fr: '▶️ Exécuter',
        es: '▶️ Ejecutar ahora'
    },
    'schedule.btn_back': {
        en: '◀️ Back to List',
        tr: '◀️ Listeye Dön',
        de: '◀️ Zurück zur Liste',
        fr: '◀️ Retour à la liste',
        es: '◀️ Volver a la lista'
    },
    'schedule.menu_schedule_setup_desc': {
        en: 'Setup CronCrew connection',
        tr: 'CronCrew bağlantısını kur',
        de: 'CronCrew-Verbindung einrichten',
        fr: 'Configurer la connexion CronCrew',
        es: 'Configurar conexión CronCrew'
    },
    'schedule.menu_schedule_list_desc': {
        en: 'List scheduled tasks',
        tr: 'Zamanlanmış görevleri listele',
        de: 'Geplante Aufgaben auflisten',
        fr: 'Lister les tâches planifiées',
        es: 'Listar tareas programadas'
    },
    'schedule.menu_schedule_add_desc': {
        en: 'Add a new scheduled task',
        tr: 'Yeni bir zamanlanmış görev ekle',
        de: 'Neue geplante Aufgabe hinzufügen',
        fr: 'Ajouter une nouvelle tâche planifiée',
        es: 'Agregar nueva tarea programada'
    },
    'schedule.menu_schedule_status_desc': {
        en: 'Show CronCrew status',
        tr: 'CronCrew durumunu göster',
        de: 'CronCrew-Status anzeigen',
        fr: 'Afficher le statut de CronCrew',
        es: 'Mostrar el estado de CronCrew'
    },
    'update.auto_updating': {
        en: '🔄 <b>[Auto-Update]</b> Developer update detected (v{version} - {commit}).\\nMerging changes and updating...',
        tr: '🔄 <b>[Otomatik Güncelleme]</b> Geliştirici güncellemesi algılandı (v{version} - {commit}).\\nDeğişiklikler birleştiriliyor ve güncelleniyor...',
        de: '🔄 <b>[Auto-Update]</b> Entwickler-Update erkannt (v{version} - {commit}).\\nÄnderungen werden zusammengeführt und aktualisiert...',
        fr: '🔄 <b>[Mise à jour auto]</b> Mise à jour du développeur détectée (v{version} - {commit}).\\nFusion des changements et mise à jour en cours...',
        es: '🔄 <b>[Actualización automática]</b> Actualización del desarrollador detectada (v{version} - {commit}).\\nFusionando cambios y actualizando...'
    },
    'update.auto_update_failed': {
        en: '❌ <b>[Auto-Update]</b> Update failed: {error}',
        tr: '❌ <b>[Otomatik Güncelleme]</b> Güncelleme başarısız oldu: {error}',
        de: '❌ <b>[Auto-Update]</b> Update fehlgeschlagen: {error}',
        fr: '❌ <b>[Mise à jour auto]</b> Échec de la mise à jour : {error}',
        es: '❌ <b>[Actualización automática]</b> Error al actualizar: {error}'
    },
    'menu.force_update_desc': {
        en: 'Force update (overwrites local changes)',
        tr: 'Zorla güncelle (yerel değişiklikleri sıfırlar)',
        de: 'Update erzwingen (lokale Änderungen überschreiben)',
        fr: 'Forcer la mise à jour (écrase les modifications locales)',
        es: 'Forzar actualización (sobrescribe cambios locales)',
        ko: '강제 업데이트 (로컬 변경사항 덮어쓰기)',
        zh: '强制更新 (覆盖本地修改)'
    },
    'update.btn_force_update': {
        en: '⚡️ Force Update (Overwrite)',
        tr: '⚡️ Zorla Güncelle (Değişiklikleri Sıfırla)',
        de: '⚡️ Update erzwingen (Änderungen verwerfen)',
        fr: '⚡️ Forcer la mise à jour (Écraser)',
        es: '⚡️ Forzar actualización (Sobrescribir)',
        ko: '⚡️ 강제 업데이트 (로컬 변경 취소)',
        zh: '⚡️ 强制更新 (丢弃本地修改)'
    },
    'update.force_updating': {
        en: '⚡️ <b>[Force Update]</b> Force update in progress...\nDiscarding local modifications and syncing with <code>origin/main</code>...',
        tr: '⚡️ <b>[Zorla Güncelleme]</b> Zorla güncelleme başlatıldı...\nYerel değişiklikler sıfırlanıyor ve <code>origin/main</code> ile eşitleniyor...',
        de: '⚡️ <b>[Update erzwingen]</b> Update wird erzwungen...\nLokale Änderungen werden verworfen und mit <code>origin/main</code> synchronisiert...',
        fr: '⚡️ <b>[Mise à jour forcée]</b> Mise à jour forcée en cours...\nSuppression des modifications locales et synchronisation avec <code>origin/main</code>...',
        es: '⚡️ <b>[Actualización forzada]</b> Actualización forzada en curso...\nDescartando modificaciones locales y sincronizando con <code>origin/main</code>...',
        ko: '⚡️ <b>[강제 업데이트]</b> 강제 업데이트 진행 중...\n로컬 변경 사항을 취소하고 <code>origin/main</code>으로 동기화합니다...',
        zh: '⚡️ <b>[强制更新]</b> 强制更新进行中...\n正在丢弃本地修改并与 <code>origin/main</code> 同步...'
    },
    'update.force_success': {
        en: '✅ Code force updated to latest remote and dependencies installed.\nBot is restarting now...',
        tr: '✅ Kodlar zorla en son sürüme güncellendi ve bağımlılıklar yüklendi.\nBot yeniden başlatılıyor...',
        de: '✅ Code wurde erfolgreich auf den neuesten Stand erzwungen und Abhängigkeiten installiert.\nBot startet neu...',
        fr: '✅ Code mis à jour de force avec succès et dépendances installées.\nLe bot redémarre maintenant...',
        es: '✅ Código actualizado forzosamente a la última versión y dependencias instaladas.\nEl bot se está reiniciando...',
        ko: '✅ 최신 원격 코드로 강제 업데이트되었으며 종속성이 설치되었습니다.\n봇을 다시 시작합니다...',
        zh: '✅ 代码已强制更新至最新版本并已安装依赖项。\nBot 正在重启...'
    },
    'update.conflict_warning': {
        en: '⚠️ <i>Local conflicts or merge issues detected. You can force update to the latest version. Note: Any local file modifications will be overwritten.</i>\n\n👉 Use /force_update or click the button below:',
        tr: '⚠️ <i>Yerel çakışmalar veya birleştirme sorunları tespit edildi. Zorla güncelleme ile en son sürüme geçebilirsiniz. Not: Yerel dosya değişiklikleriniz silinecektir.</i>\n\n👉 /force_update komutunu kullanın veya aşağıdaki butona tıklayın:',
        de: '⚠️ <i>Lokale Konflikte erkannt. Sie können das Update erzwingen, um auf die neueste Version zu aktualisieren. Hinweis: Lokale Dateiänderungen werden überschrieben.</i>\n\n👉 Verwenden Sie /force_update oder klicken Sie unten:',
        fr: '⚠️ <i>Des conflits locaux ont été détectés. Vous pouvez forcer la mise à jour. Remarque : toutes les modifications locales seront écrasées.</i>\n\n👉 Utilisez /force_update ou cliquez ci-dessous :',
        es: '⚠️ <i>Se detectaron conflictos locales. Puedes forzar la actualización. Nota: Cualquier modificación local será sobrescrita.</i>\n\n👉 Usa /force_update o haz clic abajo:',
        ko: '⚠️ <i>로컬 충돌이 감지되었습니다. 강제 업데이트하여 최신 버전으로 업데이트할 수 있습니다. 참고: 로컬 수정 사항은 덮어쓰여집니다.</i>\n\n👉 /force_update 명령어를 사용하거나 아래 버튼을 클릭하세요:',
        zh: '⚠️ <i>检测到本地冲突。您可以强制更新至最新版本。注意：任何本地修改都将被覆盖。</i>\n\n👉 使用 /force_update 或点击下方按钮：'
    }
};

function assignValue(obj, keyPath, value) {
    const parts = keyPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

const langs = ['en', 'tr', 'de', 'es', 'fr', 'ko', 'zh'];

langs.forEach(lang => {
    const filePath = path.join(LOCALES_DIR, `${lang}.json`);
    const localeObj = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let changed = false;
    for (const [keyPath, translations] of Object.entries(keysToInject)) {
        const val = translations[lang];
        if (val) {
            assignValue(localeObj, keyPath, val);
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(localeObj, null, 2) + '\n');
        console.log(`✅ Updated ${lang}.json`);
    }
});
