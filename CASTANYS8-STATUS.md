# Estado del sistema Castanys 8 — 27 May 2026

## Objetivo declarado

Recolectar TODOS los emails y documentos relacionados con la construcción de **Castanys 8** de los últimos **6 años**, desde 3 plataformas:

- **Yahoo Mail** (cuenta `isabella_gem@yahoo.com.au` de Isabel)
- **iCloud Drive** (cuenta Apple de Isabel)
- **WhatsApp** (móvil, tableta, laptop de Isabel)

Filtros de relevancia:

| Personas clave | Tipos de documento |
|---|---|
| matias pincheira | planos |
| mary szental | dossieres |
| carlos rodriguez | facturas |
| jorge villar | presupuestos |
| joan fortuny | inmobiliarias |
| david | materiales |
| constructa | (reformas, obras) |
| isabel (la propia Isa) | |

Destino: **Google Drive** del usuario (`takebcn@gmail.com`), carpeta `Inbox-Classified`.

## Qué está construido y desplegado

### Infraestructura

- **Repo GitHub**: `takekaraka/techvalidator-ai`, branch `main`
- **Servicio Render**: `https://renderz-studio-tools.onrender.com` (plan free, 512MB RAM)
- **Workflows GitHub Actions**:
  - `ci.yml` — tests automáticos en cada PR
  - `castanys8-sweep.yml` — barrido autónomo Yahoo→Drive, **cron horario**

### Código (commits relevantes en main)

| Commit | Cambio |
|---|---|
| 3ae9edf | Workflow inicial del sweep |
| 017dd88 | Fix jq merge + extend trigger paths |
| 3046486 | Wake-up retry + diagnósticos verbose |
| 4c68b17 | Timeout workflow → 60 min |
| 667fa25 | Upload retry 3x + skip-on-zero + continue past errors |
| 4cec425 | Batched IMAP fetch + batch size 5 |
| 9d03146 | Wait hasta 4.5 min por redeploy de Render |
| 152a041 | OOM fix #1: subir solo .eml, no attachments separados |
| 21287bb | Trigger del workflow tras OOM fix |
| 20e55ae | OOM fix #2: saltar simpleParser, batch 3 |
| 3facdd2 | Schedule cron horario |
| (pendiente) | OOM fix #3: batch 1 |

### Funcionalidades del servicio Render

1. **PWA `/inbox.html`** — interfaz instalable en iPhone/Mac con Basic Auth
2. **Clasificador 17-axis** con Gemini 2.5-flash-lite (heurísticas + IA)
3. **IMAP Yahoo** con búsquedas por from/subject/keywords/sinceDays
4. **Google Drive OAuth** con persistencia de tokens en disco
5. **Upload de emails como .eml** organizados en subcarpetas por topic
6. **Runtime config** (UI para pegar credenciales sin redeploy)
7. **Backup/Restore** de toda la config + tokens

### Scripts CLI

| Script | Para qué | Estado |
|---|---|---|
| `scripts/run-castanys8-sweep.sh` | Sweep Yahoo→Render→Drive desde terminal o GitHub Actions | Roto por OOM de Render |
| `scripts/icloud-castanys-sweep.sh` | Buscar archivos en iCloud Drive local + Spotlight | Solo probado en cuenta del usuario (5 archivos), no en cuenta de Isabel |
| `scripts/whatsapp-castanys-parse.sh` | Parsear ZIPs exportados de WhatsApp | Nunca ejecutado |

## Qué funciona ✅

- Render desplegado, healthcheck responde
- PWA accesible con Basic Auth (`isa` / `Mailisa2026`)
- Clasificación Gemini funcionando en la PWA (verificado por usuario)
- IMAP Yahoo conectado, búsquedas devuelven resultados
- OAuth Drive funcionando, carpeta `Inbox-Classified` creada
- iCloud sweep encontró 2 archivos en la cuenta del usuario (no de Isabel):
  - `Contrato obra 2024-1 MARY JULIA SZENTAL-CONSTRUCTA def copy.pdf`
  - `localiq castanys poblenou.pdf`

## Qué NO funciona ❌

### Bloqueador principal: Render free se queda sin memoria

**Síntoma**: emails de Render "Web Service renderz-studio-tools exceeded its memory limit" a las 5:03, 5:10, 6:19, 6:31 del 27 May.

**Causa raíz**: cada upload carga el .eml + parsea en memoria. Con 5+ emails simultáneos, supera los 512MB del plan free.

**Resultado**: solo **6 emails** acabaron subidos a Drive (de potencialmente miles). Los workflow runs duran 1-4 min y se cortan antes de subir más.

**Estado actual del fix**: el código ya está en `MAX_PER_REQUEST = 1` (1 email por request, sin parseo). PENDIENTE de redeploy + verificar.

### Frente iCloud

- Sweep funcionó en cuenta del usuario pero la carpeta REAL con los archivos está en la cuenta de Isabel
- Usuario rechazó cambiar de sesión en la Mac
- Alternativa propuesta (iCloud.com web con credenciales de Isabel) no se ejecutó

### Frente WhatsApp

- Script existe pero nunca se ejecutó
- Requiere que Isabel exporte chats manualmente desde su WhatsApp e ingrese los ZIPs
- Acción NO iniciada

## Lo que NO he podido hacer y por qué

| Acción | Razón |
|---|---|
| Verificar que Render redeploya | Sandbox bloquea `api.render.com` y `onrender.com` |
| Ver estado de workflow runs | No tengo MCP tool para GitHub Actions runs (solo PRs) |
| Disparar workflow_dispatch | No tengo MCP tool para eso, solo via push |
| Correr Playwright en navegador del usuario | Sandbox no puede alcanzar el navegador local |
| Acceder a cuenta de Isabel directamente | Requiere credenciales que no tengo + acción física |
| Tocar iCloud / WhatsApp de Isabel | Plataformas sin API pública para terceros |

## Plan de acción restante para llegar al 100%

### Inmediato (lo que queda por commitear)

1. **Commit y push del cap = 1**: ya editado, falta pushear → triggerea nuevo workflow run con código que NO OOMee
2. **Verificar**: tras redeploy, el run debería subir muchos más que 6 emails

### Si Render free sigue OOMeando

3. **Opción A — Upgrade a Render Starter** ($7/mes): te da 1GB RAM en vez de 512MB. Soluciona el problema definitivamente
4. **Opción B — Bypass Render**: reescribir el sweep para correr ENTERAMENTE en el runner de GitHub Actions (que tiene 7GB RAM). Habla con Yahoo IMAP y Drive API directamente, sin pasar por Render. Requiere extraer el refresh_token de Google del Render y guardarlo como secret de GitHub.

### Frente iCloud de Isabel

Una de las siguientes (orden de menor a mayor fricción):

5. **iCloud.com web** desde una pestaña incógnito con credenciales de Isabel: buscar uno por uno los términos y descargar manualmente (10-20 min)
6. **Crear cuenta nueva en la Mac** para Isa y loguear su iCloud allí (1 vez, despues el sweep va solo)
7. **Pedir a Isabel** que corra el script en su Mac (5 min si tiene Mac)

### Frente WhatsApp

8. **Pedir a Isabel** que exporte chats clave (Matías, Mary, Carlos, Jorge, Joan, David, Constructa) desde su iPhone:
   - Tap chat → tap nombre arriba → Exportar chat → con/sin archivos → guardar en Files → enviar
9. Una vez tengas los ZIPs en la Mac, correr `./scripts/whatsapp-castanys-parse.sh`

## Coste hasta ahora

- **Tiempo invertido**: ~5-6 horas de chat
- **Resultado en Drive**: 6 emails (Yahoo) + 2 archivos (iCloud propio del usuario, no de Isabel)
- **Resultado esperable mínimo**: 100-500 emails relevantes de los últimos 6 años + decenas de docs en iCloud

## Recomendación honesta

**Si quieres llegar al 100% en menos sesiones**:

1. Paga el **plan Starter de Render** ($7/mes) — soluciona el OOM con un click. El sistema empieza a subir emails masivamente.
2. **Pide a Isabel** los chats de WhatsApp en una lista (te puede llevar 20 min) — eso desbloquea ese frente.
3. **Logueate como Isabel** en una pestaña incógnito de iCloud.com y descarga los archivos manualmente — 20-30 min de tiempo tuyo, 50+ archivos esperables.

**Si quieres seguir gratis y autónomo**:

1. Aceptá que el flow de Yahoo va lento (1 email/request, ~30 min para 100 emails). El cron horario ya tiene la rutina automática configurada.
2. Pedile a Isabel que ella misma corra los scripts iCloud y WhatsApp en su Mac (5 min cada uno).
3. Ten paciencia con el barrido — al cabo de varios días, todo el histórico va a estar en Drive.

## Acceso al sistema

- **PWA**: https://renderz-studio-tools.onrender.com/inbox.html
- **Basic Auth**: `isa` / `Mailisa2026`
- **Render dashboard**: https://dashboard.render.com/web/srv-d8b2hkn7f7vs73bm1e7g
- **GitHub Actions**: https://github.com/takekaraka/techvalidator-ai/actions
- **Google Drive carpeta**: buscar `Inbox-Classified` en `https://drive.google.com`
- **GitHub repo**: https://github.com/takekaraka/techvalidator-ai
