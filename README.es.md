<div align="center">

# 🤖 Antigravity Telegram Suite

🌍 Idiomas: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

**Controla tu [Antigravity IDE](https://antigravity.google/) de forma remota a través de Telegram.**

Envía mensajes, cambia modelos de IA, gestiona espacios de trabajo, toma capturas de pantalla — todo desde tu teléfono.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

</div>

---

## ✨ Características

| Característica | Descripción |
|---|---|
| 💬 **Chat Headless** | Envía mensajes directamente al agente de IA vía Telegram |
| 📎 **Subida de Archivos** | Reenvía archivos/imágenes al agente con descripciones |
| 📸 **Capturas de IDE** | Captura y recibe capturas de pantalla del IDE |
| 🤖 **Cambio de Modelo** | Cambia modelos de IA (Gemini, Claude) con botones integrados |
| 📂 **Explorador de Archivos** | Navega y descarga archivos del proyecto |
| 🔄 **Gestión de Workspaces** | Cambia entre proyectos sin tocar el teclado |
| 💬 **Foco Multi-Agente** | Responde a agentes específicos o bloquea el foco en una ventana |
| ⚡ **Auto-Aceptar** | Clic automático en botones Run, Accept, Allow, Continue |
| 🔄 **Auto-Actualización** | Busca actualizaciones y auto-actualiza con un comando |
| 🌐 **Multi-Idioma** | Interfaz en inglés y turco (ampliable a español, etc.) |
| ⌨️ **Indicador de Escritura** | Muestra "escribiendo..." en lugar de enviar múltiples mensajes |
| 🖥️ **Multiplataforma** | Funciona en Linux, macOS (Intel) y Windows |

## 🚀 Inicio Rápido

### Requisitos

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) instalado
- Un token de bot de Telegram (consíguelo en [@BotFather](https://t.me/BotFather))

### 1. Clonar e Instalar

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Configurar

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
BOT_TOKEN=tu_token_de_telegram
ALLOWED_CHAT_ID=tu_chat_id
DEBUGGING_PORT=9333
LANGUAGE=es
```

> 💡 Envía `/start` a tu bot para obtener tu Chat ID.

### 3. Iniciar el IDE con CDP

El bot se comunica con el IDE a través del Chrome DevTools Protocol. Inicia Antigravity con:

```bash
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

### 4. Iniciar el Bot

```bash
npm start
```

Para operación 24/7 con PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Instalación Automática (Opcional)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

## 📱 Comandos

| Comando | Descripción |
|---|---|
| *(cualquier texto)* | Enviar directamente al agente de IA |
| `/latest` | Obtener la última respuesta del agente |
| `/screenshot` | Tomar una captura de pantalla del IDE |
| `/status` | Estado del sistema (IDE, CDP, Bot) |
| `/start_ide` | Iniciar el IDE de forma remota |
| `/close` | Cerrar completamente el IDE |
| `/new` | Abrir una nueva sesión de chat |
| `/model` | Cambiar modelo de IA |
| `/workspace` | Cambiar espacio de trabajo del proyecto |
| `/window` | Seleccionar ventana específica del IDE |
| `/file` | Explorar y descargar archivos |
| `/quota` | Consultar créditos y uso de cuota |
| `/autoaccept` | Activar/desactivar auto-aceptar |
| `/lang` | Cambiar idioma |
| `/stop` | Detener el agente en ejecución |
| `/agents` | Listar y cambiar hilos de chat |
| `/artifacts` | Listar artefactos del hilo actual |
| `/update` | Buscar actualizaciones |
| `/version` | Mostrar versión actual |
| `/menu` | Actualizar menú de comandos |

## 🏗️ Arquitectura

```
antigravity-telegram-suite/
├── src/
│   ├── index.js           # Lógica principal del bot
│   ├── cdp_controller.js   # Comunicación Chrome DevTools Protocol
│   ├── autoaccept.js       # Auto-clic de botones vía CDP
│   ├── updater.js          # Módulo de auto-actualización
│   ├── ui_locators.js      # Selectores DOM
│   ├── i18n.js             # Módulo de internacionalización
│   └── platform.js         # Abstracción multiplataforma
├── locales/
│   ├── en.json             # Strings en inglés
│   └── es.json             # Strings en español
├── scripts/
│   ├── install.sh          # Instalador Linux/macOS
│   └── install.ps1         # Instalador Windows
├── .env.example            # Plantilla de entorno
└── package.json
```

### Cómo Funciona

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity  │
│   App    │     Comandos Bot     │     Bot      │    Interacción DOM     │     IDE      │
└──────────┘                      └──────────────┘                        └─────────────┘
```

1. Envías un mensaje vía Telegram
2. El bot inyecta texto en el input del chat del IDE vía CDP
3. El bot monitorea el IDE ("escribiendo..." mostrado)
4. Al terminar, la respuesta es extraída y enviada a Telegram
5. **Auto-Aceptar**: Observa los botones de acción y los hace clic automáticamente.

## 🤝 Contribuciones

1. Haz un Fork del repositorio
2. Crea tu rama de características (`git checkout -b feature/nueva-funcionalidad`)
3. Confirma tus cambios (`git commit -m 'Añade nueva funcionalidad'`)
4. Empuja a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT — ver el archivo [LICENSE](LICENSE) para más detalles.

---

<div align="center">
Hecho con ❤️ por [Emre Türkmen](https://emreturkmen.com) para desarrolladores remotos.
</div>
