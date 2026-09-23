# SocialLive Dockerfile — multi-stage for small production image
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY tsconfig.base.json ./
COPY .env.example ./
COPY packages/ ./packages/
COPY integrations/ ./integrations/
COPY apps/server/package*.json ./apps/server/
COPY apps/server/tsconfig.json ./apps/server/
RUN npm ci --workspaces --if-present
COPY apps/server/ ./apps/server/
RUN npm run build --workspaces --if-present

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg tini
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/.env.example ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/integrations/ ./integrations/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/

VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]