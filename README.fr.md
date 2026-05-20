<div align="center">

# 🤖 Antigravity Telegram Suite

**Fonctionne avec l'[Antigravity Standalone App](https://antigravity.google/)\* et l'[Antigravity IDE](https://antigravity.google/).**

🌍 Langues : [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Contrôlez votre agent IA Antigravity à distance via Telegram.
Envoyez des messages, changez de modèle d'IA, gérez les espaces de travail, prenez des captures d'écran et exécutez des flux de travail multi-agents — le tout depuis votre téléphone.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.1.0-orange.svg)]()

\* *Certaines fonctionnalités peuvent être limitées sur l'application autonome (Standalone). Voir [Known Issues (Problèmes connus)](#-problèmes-connus-known-issues).*

</div>

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 👥 **Multi-Utilisateurs** | Partagez le contrôle du bot avec votre équipe via des identifiants de chat séparés par des virgules |
| 💬 **Headless Chat** | Envoyez des messages directement à l'agent IA via Telegram |
| 📎 **Envoi de fichiers & d'images** | Transférez des fichiers/images à l'agent avec des légendes |
| 📸 **Captures d'écran de l'IDE** | Capturez et recevez des captures d'écran à distance |
| 🤖 **Changement de modèle** | Changez de modèle d'IA (Gemini, Claude, GPT) avec des boutons |
| 📂 **Explorateur de fichiers** | Parcourez, naviguez et téléchargez les fichiers du projet |
| 🔄 **Gestion de l'espace de travail** | Changez de projet sans toucher au clavier |
| 🪟 **Prise en charge multi-fenêtres** | Dirigez les commandes vers une fenêtre IDE spécifique |
| 💬 **Gestion des discussions (Threads)** | Listez, basculez et gérez les discussions (conversations de l'agent) |
| ⚡ **Auto-Accept** | Cliquez automatiquement sur Run, Accept, Allow, Continue via un MutationObserver |
| 🚀 **Mode Turbo** | Orchestration multi-agents : Claude planifie → Gemini code → Claude vérifie → Gemini corrige |
| 🔄 **Mise à jour automatique** | Vérifiez et installez les mises à jour avec une seule commande |
| 🌐 **Multilingue** | 5 langues supportées : Anglais, Turc, Allemand, Espagnol, Français |
| ⌨️ **Indicateur de frappe** | Affiche "en train d'écrire..." dans Telegram pendant que l'agent travaille |
| 🖥️ **Multiplateforme** | Fonctionne sur Linux, macOS (Intel & Apple Silicon) et Windows |
| 🔀 **Prise en charge double application** | Basculez facilement entre Antigravity IDE et Standalone Agent App |

---

## 🚀 Démarrage Rapide

### Prérequis

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) et/ou [Antigravity Standalone App](https://antigravity.google/) installé
- Un jeton de bot Telegram (obtenez-le auprès de [@BotFather](https://t.me/BotFather))

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

Modifiez le fichier `.env` avec vos valeurs :

```env
# Telegram
BOT_TOKEN=votre_token_bot_telegram
ALLOWED_CHAT_ID=votre_chat_id

# Ports de débogage CDP (doivent correspondre au port utilisé lors du lancement)
AGENT_CDP_PORT=9333    # Port pour Standalone Antigravity App
IDE_CDP_PORT=9334      # Port pour Antigravity IDE

# Modèle IA par défaut pour les nouveaux chats
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Langue: en | tr | de | es | fr
LANGUAGE=fr

# Cible de l'application préférée: 'agent' (Standalone) ou 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Activer l'acceptation automatique par défaut
AUTOACCEPT_DEFAULT=true
```

> 💡 Envoyez `/start` à votre bot pour obtenir votre Chat ID.

### 3. Lancer l'Application avec CDP

Le bot communique avec Antigravity via le Chrome DevTools Protocol (CDP). Vous devez lancer l'application avec un port de débogage.

**Si vous exécutez les deux applications en même temps, utilisez des ports différents:**

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

> ⚠️ Les numéros de port doivent correspondre à `AGENT_CDP_PORT` et `IDE_CDP_PORT` dans votre fichier `.env`.

### 4. Démarrer le Bot

```bash
npm start
```

Pour un fonctionnement 24/7 avec PM2 :

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Installation Automatique (Optionnel)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 Commandes

### Commandes Principales

| Commande | Description |
|---|---|
| *(tout texte)* | Envoyer directement à l'agent IA |
| `/latest` | Obtenir la dernière réponse de l'agent en texte |
| `/screenshot` | Prendre une capture d'écran de la fenêtre de l'agent actif |
| `/status` | Afficher l'état du système (IDE, connexion CDP, Bot) |
| `/stop` | Arrêter l'agent en cours d'exécution |
| `/new` | Ouvrir une nouvelle session de discussion |

### Modèle IA & Agent

| Commande | Description |
|---|---|
| `/model` | Changer le modèle IA (Gemini, Claude, etc.) |
| `/turbo` | Basculer en **Mode Turbo** — orchestration multi-agents (voir ci-dessous) |
| `/agents` | Lister et basculer entre les fils de discussion (threads) |
| `/quota` | Vérifier les crédits IA et les limites d'utilisation du modèle |

### Gestion de l'App & des Fenêtres

| Commande | Description |
|---|---|
| `/start_ide` | Démarrer l'Antigravity IDE à distance |
| `/start_ag` | Démarrer la Standalone Antigravity Agent App |
| `/close_ide` | Fermer l'Antigravity IDE |
| `/close_ag` | Fermer la Standalone Agent App |
| `/close` | Fermer l'application actuellement active |
| `/app` | Basculer entre IDE et Standalone App (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | Sélectionner une fenêtre spécifique lorsque plusieurs sont ouvertes |
| `/workspace` | Changer d'espace de travail du projet |
| `/restart` | Redémarrer le processus du bot (PM2) |

### Fichiers & Utilitaires

| Commande | Description |
|---|---|
| `/file` | Parcourir et télécharger les fichiers du projet |
| `/artifacts` | Lister et télécharger les artefacts de la discussion actuelle |
| `/autoaccept` | Basculer l'acceptation automatique (on / off / état) |
| `/lang` | Changer la langue d'affichage |
| `/update` | Vérifier les mises à jour et mettre à jour automatiquement le bot |
| `/version` | Afficher les informations de la version actuelle |
| `/menu` | Mettre à jour le menu de commandes Telegram |
| `/fix_shortcuts` | Réparer les raccourcis de bureau pour les applications Antigravity |

---

## 🚀 Mode Turbo (Orchestration Multi-Agents)

Le Mode Turbo exécute un flux de travail **Agents Council (Conseil d'Agents)** qui coordonne automatiquement plusieurs modèles d'IA :

```
┌─────────────────────────────────────────────────────────────────────┐
│                          PIPELINE MODE TURBO                       │
│                                                                     │
│  Phase 1 : PLANIFICATION Claude Opus → Crée le plan de mise en œuvre│
│  Phase 2 : CODAGE        Gemini Pro  → Écrit le code                │
│  Phase 3 : RÉVISION      Claude Opus → Sécurité et revue de code    │
│  Phase 4 : CORRECTION    Gemini Pro  → Corrige les problèmes trouvés│
│  Phase 5 : RÉSUMÉ        Gemini Pro  → Résumé exécutif pour l'usager│
└─────────────────────────────────────────────────────────────────────┘
```

**Comment utiliser :**
1. Activez le Mode Turbo : `/turbo` → Sélectionnez "Activer" (Enable)
2. Envoyez votre demande sous forme de texte normal
3. Le bot changera automatiquement de modèle et exécutera toutes les phases
4. Vous recevrez des mises à jour de phase en temps réel et un résumé final

> 💡 Le Mode Turbo nécessite l'accès aux modèles Claude et Gemini dans votre abonnement Antigravity.

---

## 🏗️ Architecture

```
antigravity-telegram-suite/
├── src/
│   ├── index.js              # Logique principale du bot et commandes Telegram
│   ├── cdp_controller.js     # Communication avec le Chrome DevTools Protocol
│   ├── autoaccept.js         # Clic automatique via CDP MutationObserver
│   ├── turbo_orchestrator.js # Orchestration Mode Turbo multi-agents
│   ├── updater.js            # Module de mise à jour (git pull + pm2 restart)
│   ├── ui_locators.js        # Sélecteurs DOM pour l'interaction IDE/Agent UI
│   ├── i18n.js               # Module d'internationalisation (i18n)
│   └── platform.js           # Abstraction multiplateforme (lancement, arrêt, chemins)
├── locales/
│   ├── en.json               # Anglais
│   ├── tr.json               # Turc
│   ├── de.json               # Allemand
│   ├── es.json               # Espagnol
│   └── fr.json               # Français
├── scripts/
│   ├── install.sh            # Installateur Linux/macOS
│   └── install.ps1           # Installateur Windows
├── .env.example              # Modèle de variables d'environnement
├── CHANGELOG.md              # Historique des versions
└── package.json
```

### Comment ça marche

```
┌──────────┐      API Telegram    ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │   Commandes du Bot   │     Bot      │   Interaction au DOM   │       ou         │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. Vous envoyez un message via Telegram
2. Le bot injecte le texte dans l'entrée de discussion de l'agent IA via CDP
3. Le bot surveille l'agent (un indicateur "en train d'écrire..." s'affiche dans Telegram)
4. Une fois terminé, la réponse est extraite et renvoyée à Telegram
5. **Auto-Accept** : S'il est activé, un MutationObserver surveille les boutons d'action (Run, Accept, Allow, Continue) et clique dessus automatiquement

### Architecture à Double Application

Le bot prend en charge **deux applications Antigravity** exécutées simultanément :

| Application | Port par Défaut | Clé Config | Description |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | Application Antigravity légère axée sur la discussion |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | IDE complet avec éditeur, terminal et extensions |

Utilisez `/app` pour basculer le bot entre les applications. Le paramètre `ANTIGRAVITY_PREFERRED_APP` dans `.env` détermine l'application par défaut visée par le bot.

---

## 🌐 Ajouter une Langue

1. Copiez `locales/en.json` vers `locales/xx.json`
2. Traduisez toutes les valeurs de chaîne
3. Définissez `LANGUAGE=xx` dans votre fichier `.env`

---

## ⚠️ Problèmes Connus (Known Issues)

| Problème | Détails |
|-------|---------|
| **Limitations de Standalone App** | Certaines fonctionnalités (changement d'espace de travail, gestion des discussions) peuvent ne pas fonctionner de manière fiable avec Standalone Antigravity App. **Antigravity IDE est entièrement pris en charge et recommandé.** |
| **Mise à jour Auto dans IDE 2.0** | Si Antigravity IDE se met à jour automatiquement, les sélecteurs DOM peuvent casser jusqu'à ce que le bot soit également mis à jour. |
| **Accès aux Modèles Mode Turbo** | Le Mode Turbo nécessite que les modèles Claude et Gemini soient disponibles. Si un modèle n'est pas disponible, le pipeline échouera. |

> 💡 En tant que développeur, je préfère me concentrer sur le support de l'IDE. L'intégration de l'application autonome est fournie "au mieux" (best-effort).

---

## 🤝 Contribuer

1. Forkez le dépôt
2. Créez votre branche de fonctionnalité (`git checkout -b feature/amazing-feature`)
3. Validez vos modifications (`git commit -m 'Ajout d'une fonctionnalité incroyable'`)
4. Poussez vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

---

## 🙏 Remerciements

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Pour la prise en charge multi-fenêtres !
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — Pour les localisateurs UI de l'Agent Manager !
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — L'intégration Telegram open-source propre qui a servi de base à ce projet.
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Inspiration pour le modèle d'observateur DOM dans le module Auto-Accept.

## 🌟 Crédits & Inspirations

L'orchestration multi-agents du **Mode Turbo** a été inspirée par le dépôt [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) du Interdesigncorp Lab.

---

## 📄 Licence

Ce projet est sous licence MIT — voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

<div align="center">
Fait avec ❤️ par <a href="https://emreturkmen.com">Emre Türkmen</a> pour les développeurs à distance qui codent depuis leur canapé.

**Hé Google, si vous voulez me donner un travail, vous pouvez me contacter à [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 😂**
</div>
