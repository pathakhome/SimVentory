# ========================================================
# ComponentVault — Multi-Architecture Dockerfile
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

# Create data directory for persistent volume mount
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start production server
CMD ["node", "server.js"]
