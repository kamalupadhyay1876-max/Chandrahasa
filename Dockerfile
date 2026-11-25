FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_PATH=/data/chandrahasa.db
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ gosu tar \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY frontend/ ./public/
RUN mkdir -p /data && chown -R node:node /app /data
USER root
EXPOSE 3000
# Railway volumes are mounted at runtime and may be root-owned. Repair only the
# mounted data directory before dropping privileges; the app never runs as root.
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec gosu node node server.js"]
