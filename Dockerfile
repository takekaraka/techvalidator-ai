FROM node:18-bullseye-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir yt-dlp

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

