FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_PATH=/data/chandrahasa.db
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++     && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY frontend/ ./public/
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
