<div align="center">

# 🤖 Antigravity Telegram Suite

🌍 Langues: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

**Contrôlez votre [Antigravity IDE](https://antigravity.google/) à distance via Telegram.**

Envoyez des messages, changez de modèle d'IA, gérez vos espaces de travail, prenez des captures d'écran — le tout depuis votre téléphone.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

</div>

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 💬 **Chat Headless** | Envoyez des messages directement à l'agent IA via Telegram |
| 📎 **Envoi de Fichiers** | Transférez des fichiers/images à l'agent avec des descriptions |
| 📸 **Captures d'écran IDE** | Prenez et recevez des captures d'écran de l'IDE |
| 🤖 **Changement de Modèle** | Changez de modèle d'IA (Gemini, Claude) avec des boutons intégrés |
| 📂 **Explorateur de Fichiers** | Naviguez et téléchargez les fichiers de votre projet |
| 🔄 **Gestion de Workspace** | Changez de projet sans toucher au clavier |
| 💬 **Focus Multi-Agents** | Répondez à des agents spécifiques directement depuis Telegram |
| ⚡ **Auto-Acceptation** | Clic automatique sur Run, Accept, Allow, Continue |
| 🔄 **Auto-Mise à Jour** | Vérifiez et installez les mises à jour avec une seule commande |
| 🌐 **Multilingue** | Interface en anglais, français, turc, etc. |
| ⌨️ **Indicateur de Frappe** | Affiche "en train d'écrire..." au lieu de spamer le chat |
| 🖥️ **Multiplateforme** | Fonctionne sur Linux, macOS (Intel) et Windows |

## 🚀 Démarrage Rapide

### Prérequis

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) installé
- Un token de bot Telegram (obtenu via [@BotFather](https://t.me/BotFather))

### 1. Cloner & Installer

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Configurer

```bash
cp .env.example .env
```

Modifiez le fichier `.env` avec vos informations :

```env
BOT_TOKEN=votre_token_telegram
ALLOWED_CHAT_ID=votre_chat_id
DEBUGGING_PORT=9333
LANGUAGE=fr
```

> 💡 Envoyez `/start` à votre bot pour obtenir votre Chat ID.

### 3. Démarrer l'IDE avec CDP

Le bot communique avec l'IDE via le Chrome DevTools Protocol. Démarrez Antigravity avec :

```bash
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

### 4. Démarrer le Bot

```bash
npm start
```

Pour une exécution 24/7 avec PM2 :

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

## 📱 Commandes

| Commande | Description |
|---|---|
| *(n'importe quel texte)* | Envoyer directement à l'agent IA |
| `/latest` | Obtenir la dernière réponse de l'agent |
| `/screenshot` | Prendre une capture d'écran de l'IDE |
| `/status` | État du système (IDE, CDP, Bot) |
| `/start_ide` | Démarrer l'IDE à distance |
| `/close` | Fermer complètement l'IDE |
| `/new` | Ouvrir une nouvelle session de chat |
| `/model` | Changer de modèle d'IA |
| `/workspace` | Changer d'espace de travail (projet) |
| `/file` | Parcourir et télécharger des fichiers |
| `/autoaccept` | Activer/Désactiver l'auto-acceptation |
| `/lang` | Changer la langue |
| `/stop` | Arrêter l'agent en cours d'exécution |
| `/agents` | Lister et basculer entre les discussions |

## 🤝 Contribuer

1. Forkez le dépôt
2. Créez votre branche de fonctionnalité (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commitez vos modifications (`git commit -m 'Ajout d'une nouvelle fonctionnalité'`)
4. Poussez vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT — voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

<div align="center">
Fait avec ❤️ par [Emre Türkmen](https://emreturkmen.com) pour les développeurs travaillant depuis leur canapé.
</div>
