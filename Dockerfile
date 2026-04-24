FROM node:18-bullseye-slim

# Instalar Python, FFmpeg y yt-dlp (Requerido para bajar videos pesados)
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

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
