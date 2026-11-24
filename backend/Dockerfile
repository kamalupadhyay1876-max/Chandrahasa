FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# Native SQLite dependency requires the platform toolchain when no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /var/data && chown -R node:node /app /var/data
USER node
ENV DATA_PATH=/var/data/chandrahasa.db
EXPOSE 3000
CMD ["node", "server.js"]
