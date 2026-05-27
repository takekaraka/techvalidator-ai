#!/bin/bash
# Castanys 8 — Parser de exports de WhatsApp.
#
# WhatsApp no tiene API pública. Isa debe exportar cada chat relevante
# desde su iPhone (paso manual, instrucciones abajo). Este script consume
# los .zip exportados y filtra los mensajes + media que matchean términos
# de la construcción de Castanys 8.
#
# Uso:
#   chmod +x scripts/whatsapp-castanys-parse.sh
#   ./scripts/whatsapp-castanys-parse.sh ~/Downloads/WhatsApp_Chat*.zip
#
# Cómo exportar un chat en iPhone:
#   1. Abrir WhatsApp → tap el chat (ej. con Matías Pincheira)
#   2. Tap el NOMBRE del contacto arriba (no el chat)
#   3. Scrollear abajo → "Exportar chat"
#   4. Elegir "Adjuntar archivos" (sí incluir media)
#   5. Compartir → "Guardar en Archivos" → carpeta iCloud Drive o Mac
#   6. Repetir con cada contacto/grupo relevante (Matías, Mary, Carlos, etc.)
#   7. Mover los .zip a una carpeta y pasarlos a este script:
#        ./scripts/whatsapp-castanys-parse.sh /ruta/a/chats/*.zip

set -u

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <export1.zip> [export2.zip ...]"
  echo ""
  echo "Cómo exportar:"
  echo "  WhatsApp → chat → nombre del contacto → Exportar chat → Adjuntar archivos"
  echo "  Guardar el .zip resultante y pasárselo a este script."
  exit 1
fi

OUT="$HOME/Desktop/castanys8-whatsapp"
mkdir -p "$OUT"
echo "[*] Salida: $OUT"

# Términos en regex (case-insensitive)
TERMS="castany|matias|mati.s|pincheira|mary|szental|carlos|rodriguez|jorge|villar|joan|fortuny|david|constructa|plano|dossier|factura|presupuesto|inmobiliar|material|reforma|obra"

total_msgs=0
total_media=0

for zip in "$@"; do
  if [ ! -f "$zip" ]; then
    echo "[!] No existe: $zip"
    continue
  fi

  echo ""
  echo "[*] Procesando: $(basename "$zip")"
  TMP=$(mktemp -d)
  unzip -q "$zip" -d "$TMP" || { echo "[!] Falló unzip"; rm -rf "$TMP"; continue; }

  chat_name=$(basename "$zip" .zip | sed 's/^WhatsApp Chat - //; s/^WhatsApp_Chat_//')
  chat_dir="$OUT/$chat_name"
  mkdir -p "$chat_dir"

  # 1. Filtrar mensajes de texto
  txt_file=$(find "$TMP" -name "_chat.txt" -o -name "*.txt" | head -1)
  if [ -n "$txt_file" ] && [ -f "$txt_file" ]; then
    matches=$(grep -i -E "$TERMS" "$txt_file" | wc -l | tr -d ' ')
    if [ "$matches" -gt 0 ]; then
      grep -i -E "$TERMS" "$txt_file" > "$chat_dir/mensajes-matching.txt"
      echo "    + $matches mensajes que matchean → $chat_dir/mensajes-matching.txt"
      total_msgs=$((total_msgs + matches))
    fi
    # Guardar también el chat completo por si acaso
    cp "$txt_file" "$chat_dir/chat-completo.txt"
  fi

  # 2. Copiar TODOS los archivos media (Isa querrá revisar todos)
  for ext in pdf jpg jpeg png heic mp4 mov doc docx xls xlsx ppt pptx; do
    while IFS= read -r media; do
      [ -f "$media" ] || continue
      cp -n "$media" "$chat_dir/" 2>/dev/null && total_media=$((total_media + 1))
    done < <(find "$TMP" -type f -iname "*.$ext" 2>/dev/null)
  done

  media_count=$(find "$chat_dir" -type f \( -iname "*.pdf" -o -iname "*.jpg" -o -iname "*.png" -o -iname "*.heic" \) 2>/dev/null | wc -l | tr -d ' ')
  echo "    + $media_count archivos media → $chat_dir/"

  rm -rf "$TMP"
done

echo ""
echo "[✓] Total: $total_msgs mensajes matching, $total_media archivos media"
echo "[*] Para subir a Google Drive:"
echo "    open https://drive.google.com → arrastra $OUT entero a 'Inbox-Classified'"
echo ""
ls -lh "$OUT" 2>/dev/null
