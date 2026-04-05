# Reviewer API (Express) — not the Vite static preview. Railway must run Node, not Caddy+dist only.
FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "server/index.mjs"]
