# Multi-stage build for production-ready container
# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Runtime
# Pin digest for reproducibility — update quarterly
FROM node:20-alpine@sha256:2d5e8a8a51bc341fd5f2eed6d91455c3a3d147e91a14298fc564b5dc519c1666 AS runtime

# Build arguments for labeling
ARG BUILD_DATE
ARG GIT_COMMIT

# Install dumb-init for proper signal handling (no shell in final CMD)
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user and group
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup

WORKDIR /app

# Copy health check script first
COPY --chown=appuser:appgroup deploy/healthcheck.js ./

# Copy only necessary files from builder
COPY --from=builder --chown=appuser:appgroup /build/dist ./dist
COPY --from=builder --chown=appuser:appgroup /build/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /build/package.json ./package.json

# Remove package managers from runtime (no npm ci --only=production needed, already done in builder)
RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn

# Switch to non-root user
USER appuser

# Expose port explicitly
EXPOSE 3000

# Health check with timeout
# Note: Read-only filesystem requires writable tmpfs mounts at: /tmp, /app/.npm, /app/logs
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["node", "healthcheck.js"]

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application - no shell, direct exec
CMD ["node", "dist/api/server.js"]

# Security labels and metadata
LABEL maintainer="Hampshire Bin Platform Team"
LABEL org.opencontainers.image.title="Hampshire Bin Platform API"
LABEL org.opencontainers.image.description="Production API for Hampshire bin collection schedules"
LABEL org.opencontainers.image.source="https://github.com/yourorg/hampshire-bin-platform"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
LABEL security.no-new-privileges="true"
LABEL security.readonly-rootfs="true"
LABEL security.cap-drop="ALL"
