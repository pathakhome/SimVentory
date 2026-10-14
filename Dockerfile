# ========================================================
# SimVentory — Multi-Architecture Dockerfile
# Supports linux/amd64 (PC/Servers) and linux/arm64 (Raspberry Pi 4)
# ========================================================

# Stage 1: Build the frontend
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build production assets
COPY . .
RUN npm run build

# Stage 2: Minimal production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built frontend assets and server
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY server/ ./server/

# Create data directory for persistent volume mount
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3000

# Health check (Uses Node's native fetch on IPv4 loopback; avoids BusyBox wget options & IPv6 localhost issues)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start production server
CMD ["node", "server.js"]
