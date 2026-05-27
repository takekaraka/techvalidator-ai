#!/bin/bash
# Castanys 8 — Sweep ejecutado desde la Mac contra el servicio Render desplegado.
#
# Hace el barrido entero de Yahoo (26 queries) + upload a Drive desde la Mac
# vía curl. Más fiable que el botón del navegador (sin JS, sin SW, sin tab que
# cerrar). Log a archivo, retomable si se interrumpe.
#
# Uso:
#   chmod +x scripts/run-castanys8-sweep.sh
#   ./scripts/run-castanys8-sweep.sh
#
# Requisitos: curl, jq

set -u

URL="${RENDER_URL:-https://renderz-studio-tools.onrender.com}"
USER="${BASIC_USER:-isa}"
PASS="${BASIC_PASS:-Mailisa2026}"

echo "[*] Configuración:"
echo "    URL=$URL"
echo "    USER=$USER"
echo "    PASS=$(echo "$PASS" | head -c 4)...***"

# Verifica jq
if ! command -v jq >/dev/null 2>&1; then
  echo "[!] jq no instalado. Instala con: brew install jq"
  exit 1
fi
echo "[*] jq version: $(jq --version)"
echo "[*] curl version: $(curl --version | head -1)"

# Wake-up + redeploy wait: Render free duerme + tras un push de código
# tarda 2-3 min en redeployar. Probamos hasta 18 veces × 15s = 4.5 min.
echo "[*] Comprobando conexión a $URL/healthz (espera hasta redeploy completo)..."
attempt=0
healthy=0
while [ $attempt -lt 18 ]; do
  attempt=$((attempt + 1))
  status=$(curl -sS -m 30 -o /tmp/health.json -w "%{http_code}" "$URL/healthz" 2>&1 || echo "curl_err")
  if [ "$status" = "200" ]; then
    healthy=1
    echo "    intento $attempt → HTTP 200 ✓"
    break
  fi
  echo "    intento $attempt → HTTP $status (esperando redeploy)..."
  sleep 15
done

if [ $healthy -eq 0 ]; then
  echo "[!] No pudo establecer conexión con $URL tras 5 intentos."
  echo "[*] Continuamos igual para diagnosticar (las búsquedas reportarán errores individuales)."
fi
echo "[*] Service status: healthy=$healthy"

LOG="$HOME/Desktop/castanys8-sweep.log"
UIDS_FILE="$HOME/Desktop/castanys8-uids.txt"
ITEMS_FILE="$HOME/Desktop/castanys8-items.json"
> "$LOG"
> "$UIDS_FILE"
echo "[]" > "$ITEMS_FILE"
echo "[*] Log: $LOG"
echo "[*] UIDs únicos: $UIDS_FILE"

QUERIES=(
  '{"from":"matias","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"pincheira","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"mary szental","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"szental","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"carlos rodriguez","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"rodriguez","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"jorge villar","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"villar","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"joan fortuny","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"fortuny","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"david","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"constructa","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"from":"isabella_gem","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"castany","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"castanys 8","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"planos","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"plano","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"dossier","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"dossiers","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"factura","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"presupuesto","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"inmobiliaria","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"keywords":"material","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"subject":"castany","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"subject":"reforma","sinceDays":2190,"limit":100,"useLLM":false}'
  '{"subject":"obra","sinceDays":2190,"limit":100,"useLLM":false}'
)

total=${#QUERIES[@]}
echo "[*] Lanzando $total búsquedas..."

i=0
for q in "${QUERIES[@]}"; do
  i=$((i+1))
  label=$(echo "$q" | jq -r 'to_entries[] | select(.key|test("from|subject|keywords")) | "\(.key):\(.value)"')
  printf "[%2d/%2d] %-40s " "$i" "$total" "$label"
  resp=$(curl -sS -u "$USER:$PASS" -X POST "$URL/api/mail/search" \
    -H 'Content-Type: application/json' -d "$q" -m 90 || echo '{"items":[]}')
  count=$(echo "$resp" | jq '.items | length' 2>/dev/null || echo 0)
  echo "→ $count emails"
  echo "[$i] $label → $count" >> "$LOG"
  # Append items al archivo acumulado (dedupe global se hace después).
  echo "$resp" | jq '.items // []' > /tmp/sweep_new.json
  jq -s 'add' "$ITEMS_FILE" /tmp/sweep_new.json > "$ITEMS_FILE.tmp" 2>/dev/null \
    && mv "$ITEMS_FILE.tmp" "$ITEMS_FILE"
done

# Dedupe por uid
echo ""
echo "[*] Deduplicando por uid..."
jq '[.[] | {uid: .uid, key: .uid}] | group_by(.uid) | map(.[0].uid)' "$ITEMS_FILE" > "$UIDS_FILE.json" 2>/dev/null
total_uniq=$(jq 'length' "$UIDS_FILE.json")
echo "    → $total_uniq emails únicos"

# Volvemos a sacar los items únicos (dedupe completo)
jq 'unique_by(.uid)' "$ITEMS_FILE" > "$ITEMS_FILE.tmp" && mv "$ITEMS_FILE.tmp" "$ITEMS_FILE"

if [ "$total_uniq" -eq 0 ]; then
  echo "[!] No hay emails únicos. Termino."
  exit 0
fi

# Upload por tandas de 10 con retry y skip-on-zero (en lugar de break)
echo "[*] Subiendo $total_uniq emails a Drive en tandas de 10..."
batch_size=5
batch_num=0
uploaded=0
cursor=0
errors=0
while [ $cursor -lt $total_uniq ]; do
  batch_num=$((batch_num+1))
  start=$cursor
  end=$((cursor + batch_size))
  batch_json=$(jq ".[$start:$end]" "$ITEMS_FILE")
  printf "  Tanda %2d (emails %d–%d)... " "$batch_num" "$((start+1))" "$end"

  consumed=0
  err=""
  for try in 1 2 3; do
    resp=$(curl -sS -u "$USER:$PASS" -X POST "$URL/api/mail/upload" \
      -H 'Content-Type: application/json' \
      -d "{\"items\":$batch_json}" -m 180 2>&1)
    consumed=$(echo "$resp" | jq -r '.batch_size // 0' 2>/dev/null)
    err=$(echo "$resp" | jq -r '.error // empty' 2>/dev/null)
    [ -n "$err" ] || [ "$consumed" -gt 0 ] && break
    echo -n " retry${try}… "
    sleep $((try * 5))
  done

  if [ -n "$err" ]; then
    echo "✗ $err"
    echo "TANDA $batch_num ERROR: $err" >> "$LOG"
    errors=$((errors + 1))
    cursor=$((cursor + batch_size))   # avanza igual para no quedarse atascado
    [ $errors -gt 5 ] && echo "[!] >5 tandas con error, paro." && break
    continue
  fi

  if [ "$consumed" -eq 0 ]; then
    echo "○ 0 (los UIDs ya no están en IMAP, salto)"
    echo "TANDA $batch_num SKIPPED: 0 consumed" >> "$LOG"
    cursor=$((cursor + batch_size))
    continue
  fi

  echo "✓ +$consumed"
  uploaded=$((uploaded + consumed))
  cursor=$((cursor + consumed))
done

echo ""
echo "[✓] DONE: $uploaded / $total_uniq emails subidos a Drive."
echo "[*] Log: $LOG"
echo "[*] Carpeta en Drive: https://drive.google.com → buscar 'Inbox-Classified'"
