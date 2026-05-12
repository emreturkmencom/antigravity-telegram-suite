<div align="center">

# 🤖 Antigravity Telegram Suite

🌍 Diller: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

**[Antigravity IDE](https://antigravity.google/)'nizi Telegram üzerinden uzaktan kontrol edin.**

Mesaj gönderin, yapay zeka modellerini değiştirin, çalışma alanlarını yönetin, ekran görüntüsü alın — hepsini telefonunuzdan yapın.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

</div>

---

## ✨ Özellikler

| Özellik | Açıklama |
|---|---|
| 💬 **Headless Chat** | Telegram üzerinden yapay zeka ajanına doğrudan mesaj gönderin |
| 📎 **Dosya ve Görsel Yükleme** | Ajanınıza açıklamalarla birlikte dosya/görsel iletin |
| 📸 **IDE Ekran Görüntüsü** | Uzaktan IDE'nin ekran görüntüsünü alın |
| 🤖 **Model Değiştirme** | Yapay zeka modellerini (Gemini, Claude) butonlarla kolayca değiştirin |
| 📂 **Dosya Gezgini** | Proje dosyalarına göz atın, gezinin ve indirin |
| 🔄 **Çalışma Alanı Yönetimi** | Klavyeye dokunmadan projeler arasında geçiş yapın |
| 💬 **Çoklu Ajan Odağı** | Belirli ajanlara direkt Telegram'dan cevap yazın veya tek bir proje penceresine odaklanın |
| ⚡ **Oto-Onay (Auto-Accept)** | Run, Accept, Allow, Continue butonlarına otomatik tıklar |
| 🔄 **Otomatik Güncelleme** | Güncellemeleri kontrol edin ve tek komutla güncelleyin |
| 🌐 **Çoklu Dil Desteği** | İngilizce ve Türkçe arayüz (genişletilebilir) |
| ⌨️ **Yazıyor Göstergesi** | Sürekli mesaj atmak yerine Telegram'da "yazıyor..." durumunu gösterir |
| 🖥️ **Çapraz Platform** | Linux, macOS (Intel) ve Windows üzerinde çalışır |

## 🚀 Hızlı Başlangıç

### Gereksinimler

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) yüklü olmalı
- Bir Telegram bot token'ı ([@BotFather](https://t.me/BotFather)'dan alabilirsiniz)

### 1. Klonla & Kur

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Yapılandırma

```bash
cp .env.example .env
```

`.env` dosyasını kendi ayarlarınıza göre düzenleyin:

```env
BOT_TOKEN=sizin_telegram_bot_tokeniniz
ALLOWED_CHAT_ID=sizin_chat_id_niz
DEBUGGING_PORT=9333
LANGUAGE=tr
```

> 💡 Chat ID'nizi öğrenmek için botunuza `/start` mesajı gönderebilirsiniz.

### 3. IDE'yi CDP ile Başlatın

Bot, IDE ile Chrome DevTools Protocol (CDP) üzerinden iletişim kurar. Antigravity'yi şu şekilde başlatın:

```bash
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

### 4. Botu Başlatın

```bash
npm start
```

PM2 ile 7/24 çalışması için:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Otomatik Kurulum (İsteğe Bağlı)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

## 📱 Komutlar

| Komut | Açıklama |
|---|---|
| *(herhangi bir metin)* | Yapay zeka ajanına doğrudan gönderir |
| `/latest` | Ajanın verdiği son cevabı getirir |
| `/screenshot` | IDE'nin ekran görüntüsünü alır |
| `/status` | Sistem durumu (IDE, CDP, Bot) |
| `/start_ide` | IDE'yi uzaktan başlatır |
| `/close` | IDE'yi tamamen kapatır |
| `/new` | Yeni bir sohbet başlatır |
| `/model` | Yapay zeka modelini değiştirir |
| `/workspace` | Proje çalışma alanını değiştirir |
| `/window` | Belirli bir IDE penceresini seçer (çoklu pencere desteği) |
| `/file` | Proje dosyalarını gezer ve indirir |
| `/quota` | Yapay zeka kredilerini ve model kota kullanımını gösterir |
| `/autoaccept` | Oto-onay özelliğini açar/kapatır |
| `/lang` | Dili değiştirir |
| `/stop` | Çalışan ajanı durdurur |
| `/agents` | Sohbet konularını (thread) listeler ve değiştirir |
| `/artifacts` | Mevcut konudaki (thread) artifact'leri listeler ve indirir |
| `/update` | Güncellemeleri kontrol eder |
| `/version` | Mevcut versiyonu gösterir |
| `/menu` | Telegram komut menüsünü günceller |

## 🏗️ Mimari

```
antigravity-telegram-suite/
├── src/
│   ├── index.js           # Ana bot mantığı ve Telegram işleyicileri
│   ├── cdp_controller.js   # Chrome DevTools Protocol iletişimi
│   ├── autoaccept.js       # CDP üzerinden otomatik onay tıklayıcısı
│   ├── updater.js          # Kendi kendini güncelleme modülü
│   ├── ui_locators.js      # IDE etkileşimi için DOM element seçicileri
│   ├── i18n.js             # Çoklu dil (i18n) modülü
│   └── platform.js         # Çapraz platform işletim sistemi soyutlaması
├── locales/
│   ├── en.json             # İngilizce dil dosyası
│   └── tr.json             # Türkçe dil dosyası
├── scripts/
│   ├── install.sh          # Linux/macOS kurucusu
│   └── install.ps1         # Windows kurucusu
├── .env.example            # Ortam değişkenleri taslağı
└── package.json
```

### Nasıl Çalışıyor?

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity  │
│ Uygulama │     Bot Komutları    │     Bot      │    DOM Etkileşimi      │     IDE      │
└──────────┘                      └──────────────┘                        └─────────────┘
```

1. Telegram üzerinden bir mesaj gönderirsiniz.
2. Bot, metni CDP aracılığıyla IDE'nin sohbet girişine enjekte eder.
3. Bot, ajanın tamamlanmasını bekler (bu sırada "yazıyor..." görünür).
4. İşlem bittiğinde, yanıt çıkarılır ve Telegram'a geri gönderilir.
5. **Oto-Onay**: Etkinleştirildiğinde, bir MutationObserver Run, Accept, Allow, Continue butonlarını izler ve otomatik olarak tıklar — manuel müdahaleye gerek kalmaz.

## 🌐 Yeni Bir Dil Eklemek

1. `locales/en.json` dosyasını `locales/xx.json` olarak kopyalayın.
2. Tüm metin değerlerini çevirin.
3. `.env` dosyasında `LANGUAGE=xx` ayarını yapın.

## 🤝 Katkıda Bulunma

1. Repoyu fork'layın
2. Yeni özellik dalı oluşturun (`git checkout -b feature/harika-ozellik`)
3. Değişikliklerinizi commit'leyin (`git commit -m 'Harika özellik eklendi'`)
4. Dalı push'layın (`git push origin feature/harika-ozellik`)
5. Bir Pull Request açın

## 🙏 Teşekkürler

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Belirli IDE pencerelerine komut yönlendirme yeteneğini kazandıran Çoklu Pencere Desteği özelliği için!
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — Konu (thread) yönetimi için IDE'nin DOM yapısını tanımlamaya yardımcı olan Agent Manager arayüz lokasyonları için!
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — Bu projeye temel oluşturan temiz, açık kaynaklı Telegram entegrasyonu için.
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Otomatik tıklama (Auto-Accept) modülündeki DOM observer yapısına ilham veren projesi için.

## 📄 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır — detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<div align="center">
Koltuktan kod yazan uzaktan geliştiriciler için [Emre Türkmen](https://emreturkmen.com) tarafından ❤️ ile yapılmıştır.

**Hey Google, bana bir iş vermek istersen [hello@emreturkmen.com](mailto:hello@emreturkmen.com) adresinden ulaşabilirsin 😂**
</div>
