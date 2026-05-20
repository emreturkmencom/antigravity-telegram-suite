<div align="center">

# 🤖 Antigravity Telegram Suite

**Hem [Antigravity Standalone App](https://antigravity.google/)\* hem de [Antigravity IDE](https://antigravity.google/) ile çalışır.**

🌍 Diller: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Antigravity AI ajanınızı Telegram üzerinden uzaktan kontrol edin.
Telefonunuzdan mesaj gönderin, yapay zeka modellerini değiştirin, çalışma alanlarını (workspace) yönetin, ekran görüntüsü alın ve çoklu ajan (multi-agent) iş akışlarını çalıştırın.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.1.0-orange.svg)]()

\* *Bazı özelliklerin Standalone (Bağımsız) Uygulamada kısıtlamaları olabilir. [Bilinen Sorunlar](#-bilinen-sorunlar) kısmına göz atın.*

</div>

---

## ✨ Özellikler

| Özellik | Açıklama |
|---|---|
| 💬 **Headless Chat** | Telegram üzerinden AI ajanına doğrudan mesaj gönderin |
| 📎 **Dosya ve Görsel Yükleme** | Ajanınıza açıklamalarla birlikte dosya/görsel iletin |
| 📸 **IDE Ekran Görüntüsü** | Uzaktan IDE'nin ekran görüntüsünü alın |
| 🤖 **Model Değiştirme** | Satıriçi (inline) butonlarla AI modelini değiştirin (Gemini, Claude, GPT) |
| 📂 **Dosya Gezgini** | Proje dosyalarınızda gezinin ve indirin |
| 🔄 **Workspace Yönetimi** | Klavyeye dokunmadan projeler arası geçiş yapın |
| 🪟 **Çoklu Pencere Desteği** | Birden fazla IDE açıkken komutları belirli bir pencereye yönlendirin |
| 👥 **Çoklu Kullanıcı (Multi-User)** | Virgülle ayrılmış Chat ID'leri ile botunuzu ekibinizle paylaşın |
| 💬 **Thread Yönetimi** | Sohbet oturumlarını (thread) listeleyin, değiştirin ve yönetin |
| ⚡ **Oto-Onay (Auto-Accept)** | DOM MutationObserver ile Run, Accept, Allow butonlarına otomatik tıklayın |
| 🚀 **Turbo Mod** | Çoklu ajan orkestrasyonu: Claude planlar → Gemini kodlar → Claude inceler → Gemini düzeltir |
| 🔄 **Oto-Güncelleme** | Tek bir komutla güncellemeleri kontrol edin ve botu güncelleyin |
| 🌐 **Çoklu Dil** | 5 dil desteği: İngilizce, Türkçe, Almanca, İspanyolca, Fransızca |
| ⌨️ **Yazıyor Göstergesi** | Ajan çalışırken Telegram'da "yazıyor..." durumunu gösterir |
| 🖥️ **Çapraz Platform** | Linux, macOS (Intel & Apple Silicon) ve Windows'ta çalışır |
| 🔀 **Çift Uygulama Desteği** | Antigravity IDE ve Standalone App arasında sorunsuzca geçiş yapın |

---

## 🚀 Hızlı Başlangıç

### Gereksinimler

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) ve/veya [Antigravity Standalone App](https://antigravity.google/) yüklü olmalıdır
- Bir Telegram bot token'ı ([@BotFather](https://t.me/BotFather)'dan alınabilir)

### 1. Klonla & Yükle

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Yapılandırma

```bash
cp .env.example .env
```

`.env` dosyasını kendi bilgilerinizle düzenleyin:

```env
# Telegram
BOT_TOKEN=sizin_bot_tokeniniz
ALLOWED_CHAT_ID=sizin_chat_id,diger_kullanici_chat_id

# CDP Debug Portları (başlatırken kullanılan --remote-debugging-port ile eşleşmelidir)
AGENT_CDP_PORT=9333    # Standalone Antigravity App için port
IDE_CDP_PORT=9334      # Antigravity IDE için port

# Yeni sohbetlerde otomatik seçilecek yapay zeka modeli
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Dil: en | tr | de | es | fr
LANGUAGE=tr

# Tercih edilen uygulama: 'agent' (Standalone) veya 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Oto-onay özelliğini varsayılan olarak açık tut
AUTOACCEPT_DEFAULT=true
```

> 💡 Chat ID'nizi öğrenmek için botunuza `/start` mesajı gönderebilirsiniz.

### 3. Uygulamayı CDP ile Başlatın

Bot, Antigravity ile Chrome DevTools Protokolü (CDP) üzerinden iletişim kurar. Uygulamayı bir debug portu ile başlatmalısınız.

**Her iki uygulamayı aynı anda kullanıyorsanız farklı portlar kullanın:**

```bash
# --- Standalone Antigravity App ---
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

```bash
# --- Antigravity IDE ---
# Linux
antigravity-ide --remote-debugging-port=9334

# macOS
open -a "Antigravity IDE" --args --remote-debugging-port=9334

# Windows
"Antigravity IDE.exe" --remote-debugging-port=9334
```

> ⚠️ Port numaraları `.env` dosyanızdaki `AGENT_CDP_PORT` ve `IDE_CDP_PORT` ile tam olarak eşleşmelidir.

### 4. Botu Başlatın

```bash
npm start
```

PM2 ile 7/24 çalışma için:

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

---

## 📱 Komutlar

### Temel Komutlar

| Komut | Açıklama |
|---|---|
| *(herhangi bir metin)* | AI ajanına doğrudan mesaj gönderir |
| `/latest` | Ajanın verdiği son cevabı metin olarak getirir |
| `/screenshot` | Aktif IDE/Ajan penceresinin ekran görüntüsünü alır |
| `/status` | Sistem durumunu (IDE, CDP bağlantısı, Bot) gösterir |
| `/stop` | O an çalışan ajanı durdurur |
| `/new` | Yeni bir sohbet oturumu açar |

### AI Model & Ajan

| Komut | Açıklama |
|---|---|
| `/model` | Yapay zeka modelini (Gemini, Claude vb.) değiştirir |
| `/turbo` | **Turbo Modu** aç/kapat — çoklu ajan orkestrasyonu |
| `/agents` | Sohbet oturumlarını (thread) listeler ve geçiş yapar |
| `/quota` | AI kredilerini ve model kullanım limitlerini kontrol eder |

### Uygulama & Pencere Yönetimi

| Komut | Açıklama |
|---|---|
| `/start_ide` | Antigravity IDE'yi uzaktan başlatır |
| `/start_ag` | Standalone Antigravity Ajan Uygulamasını başlatır |
| `/close_ide` | Antigravity IDE'yi kapatır |
| `/close_ag` | Standalone Ajan Uygulamasını kapatır |
| `/close` | O an aktif olan uygulamayı kapatır |
| `/app` | IDE ve Standalone Ajan arasında hedefi değiştirir (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | Birden fazla pencere açıkken belirli birini seçer |
| `/workspace` | Proje çalışma alanını (workspace) değiştirir |
| `/restart` | Bot sürecini yeniden başlatır (PM2) |

### Dosyalar & Araçlar

| Komut | Açıklama |
|---|---|
| `/file` | Proje dosyalarına göz atın ve indirin |
| `/artifacts` | Mevcut sohbetteki artifact (dosya) çıktılarını listeler ve indirir |
| `/autoaccept` | Oto-onay özelliğini yönetir (aç / kapat / durum) |
| `/lang` | Görüntüleme dilini değiştirir |
| `/update` | Güncellemeleri kontrol eder, changelog'u gösterir ve botu otomatik günceller |
| `/version` | Mevcut sürüm bilgisini gösterir |
| `/menu` | Telegram komut menüsünü yeniler |
| `/fix_shortcuts` | Antigravity uygulamaları için masaüstü kısayollarını onarır |

---

## 🚀 Turbo Mod (Multi-Agent Orkestrasyonu)

Turbo Mod, birden fazla AI modelini otomatik koordine eden bir **Ajan Konseyi** (Agents Council) iş akışı yürütür:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TURBO MOD AKIŞI                             │
│                                                                     │
│  Aşama 1: PLANLAMA        Claude Opus → Mimari planı oluşturur      │
│  Aşama 2: KODLAMA         Gemini Pro  → Kodu yazar                  │
│  Aşama 3: İNCELEME        Claude Opus → Güvenlik ve kod incelemesi  │
│  Aşama 4: DÜZELTME        Gemini Pro  → Bulunan sorunları çözer     │
│  Aşama 5: ÖZET            Gemini Pro  → Kullanıcıya nihai özet sunar│
└─────────────────────────────────────────────────────────────────────┘
```

**Nasıl Kullanılır:**
1. Turbo Modu Etkinleştirin: `/turbo` → "Etkinleştir" (Enable) seçin
2. İsteğinizi normal bir metin olarak gönderin
3. Bot otomatik olarak modelleri değiştirip tüm aşamaları tamamlar
4. Gerçek zamanlı güncellemeler ve nihai bir özet alırsınız

> 💡 Turbo Mod, Antigravity aboneliğinizde hem Claude hem de Gemini modellerine erişim gerektirir.

---

## 🏗️ Mimari

```
antigravity-telegram-suite/
├── src/
│   ├── index.js              # Ana bot mantığı ve Telegram komutları
│   ├── cdp_controller.js     # Chrome DevTools Protocol iletişimi
│   ├── autoaccept.js         # DOM MutationObserver tabanlı oto-onay botu
│   ├── turbo_orchestrator.js # Çoklu ajan (Turbo Mod) orkestrasyonu
│   ├── updater.js            # Oto-güncelleme modülü (git pull + pm2 restart)
│   ├── ui_locators.js        # Arayüz ile etkileşim için DOM seçicileri
│   ├── i18n.js               # Çoklu dil (yerelleştirme) modülü
│   └── platform.js           # Çapraz platform OS soyutlaması
├── locales/
│   ├── en.json               # İngilizce
│   ├── tr.json               # Türkçe
│   ├── de.json               # Almanca
│   ├── es.json               # İspanyolca
│   └── fr.json               # Fransızca
├── scripts/
│   ├── install.sh            # Linux/macOS yükleyicisi
│   └── install.ps1           # Windows yükleyicisi
├── .env.example              # Ortam değişkenleri şablonu
├── CHANGELOG.md              # Sürüm geçmişi
└── package.json
```

### Nasıl Çalışır?

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │     Bot Komutları    │     Bot      │    DOM Etkileşimi      │       veya       │
└──────────┘                      └──────────────┘                        │ Standalone Ajan  │
                                                                          └─────────────────┘
```

### Çift Uygulama Mimarisi

Bot eşzamanlı çalışan **iki Antigravity uygulamasını** destekler:

| Uygulama | Varsayılan Port | Config Anahtarı | Açıklama |
|-----|-------------|------------|-------------|
| **Standalone Ajan** | `9333` | `AGENT_CDP_PORT` | Sohbet odaklı hafif Antigravity uygulaması |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | Tam teşekküllü geliştirme ortamı (IDE) |

---

## ⚠️ Bilinen Sorunlar

| Sorun | Detay |
|-------|---------|
| **Standalone Uygulama Kısıtlamaları** | Bazı özellikler (workspace geçişi, thread yönetimi) Standalone sürümde her zaman kararlı çalışmayabilir. **Antigravity IDE tamamen desteklenmektedir ve kullanılması şiddetle tavsiye edilir.** |
| **IDE 2.0 Oto-Güncellemeleri** | Antigravity IDE kendini güncellerse, DOM seçicileri bot da güncellenene kadar geçici olarak bozulabilir. |
| **Turbo Mod Model Erişimi** | Turbo Mod, hem Claude hem de Gemini modellerine erişim gerektirir. Biri eksikse işlem başarısız olur. |

> 💡 Bir geliştirici olarak odak noktam IDE desteğini kusursuz tutmaktır. Standalone uygulamaya entegrasyon "elimizden geldiğince" desteklenmektedir.

---

## 📄 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır — detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<div align="center">
Kanepesinden kod yazan tembel geliştiriciler için ❤️ ile <a href="https://emreturkmen.com">Emre Türkmen</a> tarafından yapılmıştır.

**Hey Google, eğer bana iş vermek isterseniz bana [hello@emreturkmen.com](mailto:hello@emreturkmen.com) adresinden ulaşabilirsiniz 😂**
</div>
