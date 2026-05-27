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
set -o pipefail

URL="${RENDER_URL:-https://renderz-studio-tools.onrender.com}"
USER="${BASIC_USER:-isa}"
PASS="${BASIC_PASS:-Mailisa2026}"

# Verifica jq
if ! command -v jq >/dev/null 2>&1; then
  echo "[!] jq no instalado. Instala con: brew install jq"
  exit 1
fi

# Verifica conectividad + auth
echo "[*] Comprobando conexión a $URL..."
status=$(curl -sS -u "$USER:$PASS" -o /tmp/health.json -w "%{http_code}" "$URL/healthz")
if [ "$status" != "200" ]; then
  echo "[!] /healthz devuelve $status. Verifica URL/credenciales."
  cat /tmp/health.json
  exit 1
fi
echo "    ✓ Service Live"

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

# Upload por tandas de 10
echo "[*] Subiendo $total_uniq emails a Drive en tandas de 10..."
batch_size=10
batch_num=0
uploaded=0
while [ $uploaded -lt $total_uniq ]; do
  batch_num=$((batch_num+1))
  start=$uploaded
  end=$((uploaded + batch_size))
  batch_json=$(jq ".[$start:$end]" "$ITEMS_FILE")
  printf "  Tanda %2d (emails %d–%d)... " "$batch_num" "$((start+1))" "$end"
  resp=$(curl -sS -u "$USER:$PASS" -X POST "$URL/api/mail/upload" \
    -H 'Content-Type: application/json' \
    -d "{\"items\":$batch_json}" -m 90)
  consumed=$(echo "$resp" | jq -r '.batch_size // 0' 2>/dev/null)
  err=$(echo "$resp" | jq -r '.error // empty' 2>/dev/null)
  if [ -n "$err" ]; then
    echo "✗ $err"
    echo "TANDA $batch_num ERROR: $err" >> "$LOG"
    break
  fi
  echo "✓ +$consumed"
  uploaded=$((uploaded + consumed))
  [ "$consumed" -eq 0 ] && echo "[!] Tanda devolvió 0 emails consumidos, paro." && break
done

echo ""
echo "[✓] DONE: $uploaded / $total_uniq emails subidos a Drive."
echo "[*] Log: $LOG"
echo "[*] Carpeta en Drive: https://drive.google.com → buscar 'Inbox-Classified'"
