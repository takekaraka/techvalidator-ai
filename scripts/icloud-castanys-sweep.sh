#!/bin/bash
# Castanys 8 — Barrido de iCloud Drive desde la Mac de Isa/usuario.
#
# Busca archivos en iCloud Drive cuyo nombre O contenido (indexado por Spotlight)
# contenga términos relacionados con la construcción de Castanys 8.
# Copia los matches a ~/Desktop/castanys8-icloud para luego subir a Google Drive.
#
# Uso:
#   chmod +x scripts/icloud-castanys-sweep.sh
#   ./scripts/icloud-castanys-sweep.sh
#
# Requisitos: macOS con iCloud Drive sincronizado.

set -u

ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
OUT="$HOME/Desktop/castanys8-icloud"

if [ ! -d "$ICLOUD" ]; then
  echo "[!] No encuentro iCloud Drive en $ICLOUD"
  echo "    Verifica en System Settings → Apple ID → iCloud → iCloud Drive (On)"
  exit 1
fi

mkdir -p "$OUT"
echo "[*] iCloud Drive: $ICLOUD"
echo "[*] Salida:       $OUT"
echo ""

TERMS=(
  "castany" "castanys" "castanys 8"
  "matias" "pincheira"
  "mary" "szental"
  "carlos" "rodriguez"
  "jorge" "villar"
  "joan" "fortuny"
  "david"
  "constructa"
  "plano" "planos"
  "dossier" "dossiers"
  "factura" "facturas"
  "presupuesto" "presupuestos"
  "inmobiliaria" "inmobiliarias"
  "material" "materiales"
  "reforma" "obra"
)

# Spotlight ya indexa iCloud Drive: nombre + contenido (PDF, DOCX, etc.)
total=0
for term in "${TERMS[@]}"; do
  printf "  → %-20s " "$term"
  count=0
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    # cp -n: no sobrescribe si ya existe
    cp -n "$file" "$OUT/" 2>/dev/null && count=$((count + 1))
  done < <(mdfind -onlyin "$ICLOUD" "$term" 2>/dev/null)
  echo "$count nuevos"
  total=$((total + count))
done

echo ""
echo "[✓] $total archivos copiados a $OUT"
echo "[*] Para subir a Google Drive:"
echo "    open https://drive.google.com → arrastra la carpeta $OUT a 'Inbox-Classified'"
echo ""
ls -lh "$OUT" 2>/dev/null | head -30
