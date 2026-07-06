FROM node:20-bookworm-slim
WORKDIR /app

# Prisma necesita openssl en runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# Instala dependencias (incluye prisma CLI para generate/migrate)
COPY package*.json ./
RUN npm ci

# Genera el cliente de Prisma a partir del schema
COPY prisma ./prisma
RUN npx prisma generate

# Copia el resto del codigo
COPY . .

EXPOSE 4000

# Al arrancar: aplica migraciones y levanta el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
