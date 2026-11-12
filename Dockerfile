# Image « tout-en-un » : le serveur Node sert aussi le site compilé.
# Utilisable sur n'importe quel hébergeur de conteneurs (Render, Koyeb, Fly.io, un VPS, ta machine…).
#   docker build -t griboulade . && docker run -p 3001:3001 -e DATABASE_URL=… griboulade
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev
COPY . .
# VITE_SERVER_URL vide : le site parle au serveur qui le sert (même origine, pas de CORS).
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --include-workspace-root && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 3001
CMD ["node", "--enable-source-maps", "server/dist/index.js"]
