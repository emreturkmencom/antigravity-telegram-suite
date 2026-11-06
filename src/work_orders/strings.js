// UI strings for Work Orders. Kept here instead of locales/*.json so the feature
// can ship with en + tr; any other language falls back to English.

const STR = {
    en: {
        panel_title: '🗂 Work Orders',
        panel_body: 'Folder: {dir}\nDesks: {desks} · Queued: {queued} · Running: {running} · Awaiting approval: {awaiting}',
        btn_new_desk: '➕ New desk',
        btn_new_order: '✉️ New order',
        btn_desks: '🗂 Desks',
        btn_status: '📊 Status',
        btn_help: '❓ Help',
        btn_back: '⬅️ Back',
        btn_cancel: '✖️ Cancel',
        btn_instructions: '✏️ Instructions',
        btn_last_result: '📄 Last result',
        btn_archive: '🗑 Archive',
        btn_archive_confirm: '🗑 Yes, archive',
        btn_approval: '🔁 Approval: {mode}',
        btn_first_order: '✉️ Send first order',
        btn_auto: '⚡ Run automatically',
        btn_ask: '✋ Ask me first',
        approval_auto: 'automatic',
        approval_telegram: 'ask me first',
        no_desks: 'No desks yet. Create one with ➕ New desk.',
        choose_desk: 'Which desk?',
        desk_view: '📁 Desk: {desk}\nApproval: {approval}\nLast order: {last}\n\nInstructions:\n{instructions}',
        desk_none: '(none)',
        desk_not_found: 'Desk "{desk}" not found.',
        ask_desk_name: 'Send a name for the new desk (e.g. comments, video-qa).\n/cancel to stop.',
        bad_desk_name: 'That name doesn\'t work. Use letters, digits and - (max 32). Try again or /cancel.',
        desk_exists: 'A desk named "{desk}" already exists. Send another name or /cancel.',
        ask_instructions: 'Desk "{desk}". Now send its standing instructions: what this agent does and the rules it follows. Send - to skip.',
        ask_approval: 'Should orders on "{desk}" run automatically, or wait for your approval on Telegram?',
        desk_created: '✅ Desk "{desk}" created.\n{path}',
        ask_order: 'Send the order for desk "{desk}". Multi-line is fine.\n/cancel to stop.',
        order_queued: '📨 Order {id} queued for desk "{desk}". The result will come here.',
        order_queued_approval: '📨 Order {id} saved for desk "{desk}". I will ask for your approval before it runs.',
        current_instructions: 'Current instructions of "{desk}":\n\n{instructions}\n\nSend the new instructions (they replace the current ones), or /cancel.',
        instructions_saved: '✅ Instructions of "{desk}" updated.',
        archive_confirm: 'Archive desk "{desk}"? Its folder and memory move to archive/ (nothing is deleted).',
        archived: '🗑 Desk "{desk}" archived.',
        approval_set: '🔁 "{desk}" approval: {mode}.',
        no_result: 'No finished order on "{desk}" yet.',
        last_result: '📄 {id} — {status}\n\n{text}',
        status_none: 'Nothing queued or running.',
        status_live: 'Live:\n{live}',
        status_recent: 'Recent:\n{recent}',
        cancelled: 'Cancelled.',
        runner_down: 'Work orders runner is not running.',
        empty_text: 'Empty message — send some text or /cancel.',
        help: 'Work Orders: give your Antigravity agents jobs from Telegram.\n\n• A desk is a folder with its own AGENT.md (rules + memory) and its own IDE window. Make one desk per kind of job (comments, video-qa, report…).\n• ✉️ New order sends a job to a desk. The agent writes its answer to a result file; the result comes back here.\n• Scripts can drop orders into the inbox/ folder too.\n• Shortcut: /wo <desk> <order text>\n\nFolder: {dir}',
    },
    tr: {
        panel_title: '🗂 İş Emirleri',
        panel_body: 'Klasör: {dir}\nMasa: {desks} · Sırada: {queued} · Çalışan: {running} · Onay bekleyen: {awaiting}',
        btn_new_desk: '➕ Yeni masa',
        btn_new_order: '✉️ Yeni iş emri',
        btn_desks: '🗂 Masalar',
        btn_status: '📊 Durum',
        btn_help: '❓ Yardım',
        btn_back: '⬅️ Geri',
        btn_cancel: '✖️ İptal',
        btn_instructions: '✏️ Talimatlar',
        btn_last_result: '📄 Son sonuç',
        btn_archive: '🗑 Arşivle',
        btn_archive_confirm: '🗑 Evet, arşivle',
        btn_approval: '🔁 Onay: {mode}',
        btn_first_order: '✉️ İlk iş emrini gönder',
        btn_auto: '⚡ Otomatik çalışsın',
        btn_ask: '✋ Önce bana sor',
        approval_auto: 'otomatik',
        approval_telegram: 'önce bana sor',
        no_desks: 'Henüz masa yok. ➕ Yeni masa ile oluştur.',
        choose_desk: 'Hangi masa?',
        desk_view: '📁 Masa: {desk}\nOnay: {approval}\nSon iş: {last}\n\nTalimatlar:\n{instructions}',
        desk_none: '(yok)',
        desk_not_found: '"{desk}" adında masa yok.',
        ask_desk_name: 'Yeni masa için bir ad gönder (ör. yorumlar, video-qa).\nVazgeçmek için /cancel.',
        bad_desk_name: 'Bu ad olmuyor. Harf, rakam ve - kullan (en fazla 32). Tekrar dene ya da /cancel.',
        desk_exists: '"{desk}" adında bir masa zaten var. Başka bir ad gönder ya da /cancel.',
        ask_instructions: '"{desk}" masası. Şimdi kalıcı talimatlarını gönder: bu agent ne yapar, hangi kurallara uyar. Atlamak için - gönder.',
        ask_approval: '"{desk}" masasındaki iş emirleri otomatik mi çalışsın, yoksa Telegram\'dan onayını mı beklesin?',
        desk_created: '✅ "{desk}" masası oluşturuldu.\n{path}',
        ask_order: '"{desk}" masası için iş emrini gönder. Çok satırlı olabilir.\nVazgeçmek için /cancel.',
        order_queued: '📨 {id} iş emri "{desk}" masasında sıraya alındı. Sonuç buraya gelecek.',
        order_queued_approval: '📨 {id} iş emri "{desk}" masası için kaydedildi. Çalışmadan önce onayını soracağım.',
        current_instructions: '"{desk}" masasının şu anki talimatları:\n\n{instructions}\n\nYeni talimatları gönder (eskisinin yerine geçer) ya da /cancel.',
        instructions_saved: '✅ "{desk}" talimatları güncellendi.',
        archive_confirm: '"{desk}" masası arşivlensin mi? Klasörü ve hafızası archive/ altına taşınır (hiçbir şey silinmez).',
        archived: '🗑 "{desk}" masası arşivlendi.',
        approval_set: '🔁 "{desk}" onay: {mode}.',
        no_result: '"{desk}" masasında henüz biten iş yok.',
        last_result: '📄 {id} — {status}\n\n{text}',
        status_none: 'Sırada ya da çalışan iş yok.',
        status_live: 'Canlı:\n{live}',
        status_recent: 'Son işler:\n{recent}',
        cancelled: 'İptal edildi.',
        runner_down: 'İş emri çalıştırıcısı çalışmıyor.',
        empty_text: 'Boş mesaj. Bir metin gönder ya da /cancel.',
        help: 'İş Emirleri: Antigravity agent\'larına Telegram\'dan iş ver.\n\n• Masa, kendi AGENT.md\'si (kurallar + hafıza) ve kendi IDE penceresi olan bir klasördür. Her iş türü için bir masa aç (yorumlar, video-qa, rapor…).\n• ✉️ Yeni iş emri bir masaya iş gönderir. Agent cevabını bir sonuç dosyasına yazar, sonuç buraya gelir.\n• Scriptler de inbox/ klasörüne iş emri bırakabilir.\n• Kısayol: /wo <masa> <iş emri metni>\n\nKlasör: {dir}',
    },
};

function lang() {
    try {
        const l = require('../i18n').getLang();
        return STR[l] ? l : 'en';
    } catch (_) {
        return 'en';
    }
}

function s(key, vars = {}) {
    const str = STR[lang()][key] || STR.en[key] || key;
    return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

module.exports = { s, STR };
