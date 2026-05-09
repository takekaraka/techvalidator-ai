FROM node:18-bullseye-slim

# Force rebuild: 2026-05-09-v2
# Instalar Python, FFmpeg y yt-dlp
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg curl wget && \
    wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    /usr/local/bin/yt-dlp --version

# Crear carpeta app
WORKDIR /app

# Copiar dependencias e instalar Node
COPY package*.json ./
RUN npm install

# Copiar resto del código
COPY . .

# Exponer puerto para Render
EXPOSE 3000
CMD ["npm", "start"]

