# 🧠 IG AI Advisor — Local Agent

Un Agente Autónomo de Curación de IA impulsado por **Gemini 2.5 Flash** y diseñado con una estética brutalista/editorial. 

¿Cansado de guardar Reels o Shorts de YouTube sobre "Nuevas Herramientas IA" y nunca usarlos? Este agente descarga el video, lo analiza multimodalmente, investiga cada herramienta mencionada (popularidad, seguridad, pros y contras) y **te permite instalarlas con un solo clic en tu propia terminal**.

---

## ⚡ Características Principales

- **Análisis Multimodal Automático**: Sube un video local o pega una URL de Instagram/YouTube/TikTok.
- **Investigación Profunda**: Extrae ventajas, desventajas, proyectos ideales, seguridad y puntuación en GitHub.
- **Botón "Instalar Ahora"**: Ejecuta el comando de instalación directamente en tu sistema (`child_process.exec`).
- **Resumen Ejecutivo**: Te dice exactamente qué instalar, qué evaluar y qué ignorar.
- **UI Brutalista**: Interfaz 100% personalizada con Space Grotesk, negro puro y líneas de un píxel.

---

## 🚀 Instalación y Uso (Local First)

Este proyecto está diseñado para ejecutarse **localmente** para que el botón de instalación tenga permisos sobre tu propia máquina y no dependas de servidores de terceros.

### 1. Requisitos
- [Node.js](https://nodejs.org/en/) (v18+)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado (`brew install yt-dlp` en Mac o descargado vía pip)
- Una API Key de [Google AI Studio](https://aistudio.google.com/app/apikey) (Gemini 2.5 Flash).

### 2. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/ig-ai-advisor.git
cd ig-ai-advisor
```

### 3. Instalar dependencias
```bash
npm install
```

### 4. Configurar Variables de Entorno
Copia el archivo de ejemplo y agrega tu clave de API:
```bash
cp .env.example .env
```
Abre `.env` y pega tu clave:
```
GEMINI_API_KEY="AIzaSyTuClaveAqui..."
PORT=3000
```

### 5. Iniciar el Agente
```bash
npm start
```
Abre **http://localhost:3000** en tu navegador.

---

## 🛡️ Seguridad y Privacidad

- **Tu sistema, tus reglas**: Al ejecutarse en localhost, los comandos de instalación ocurren en tu máquina bajo tu control. **Lee el comando antes de hacer clic en "Instalar"**.
- El servidor Node.js tiene un bloqueo básico de seguridad (`rm -rf`, `sudo`), pero siempre se recomienda sentido común.
- Tus videos y análisis se guardan localmente en la carpeta `data/`.

---

## 📐 Diseño & Stack

- **Backend**: Node.js, Express, Multer, API de Gemini.
- **Frontend**: Vanilla JS (Server-Sent Events para progreso en tiempo real), CSS Custom Properties.
- **Estética**: Figura Sonora / Renderz Studio DNA (Pure Black, Space Grotesk, Inter).

---

## ☕ Apoya el Proyecto

Si este agente te ha ahorrado horas de investigación, dolores de cabeza instalando librerías rotas, o simplemente te encanta la interfaz... ¡puedes invitarme a un café!

[![Donar con PayPal](https://img.shields.io/badge/Donar_con-PayPal-00457C?style=for-the-badge&logo=paypal)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=takekaraka@yahoo.com&currency_code=EUR&source=url)

---
*Hecho con ⚡ para desarrolladores que valoran su tiempo y su terminal.*
