FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm install

# --- dev: código montado como volume, hot-reload ---
FROM deps AS dev
COPY . .
CMD ["npm", "run", "dev"]

# --- build: compila el bundle standalone de producción ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- runner: imagen mínima para producción, sin código fuente ni node_modules de dev ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
