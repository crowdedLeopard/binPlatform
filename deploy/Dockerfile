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
FROM node:20-alpine AS runtime

# Build arguments for labeling
ARG BUILD_DATE
ARG GIT_COMMIT

# Install dumb-init for proper signal handling and wget for health checks
RUN apk add --no-cache dumb-init wget && \
    apk del apk-tools && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy only necessary files from builder (dist only, not node_modules sources)
COPY --from=builder --chown=nodejs:nodejs /build/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /build/package.json ./package.json

# Remove any package managers from runtime (defense in depth)
RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn

# Switch to non-root user
USER nodejs

# Expose port explicitly
EXPOSE 3000

# Health check with proper endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application with security options
CMD ["node", "--no-deprecation", "dist/api/server.js"]

# Security labels and metadata
LABEL maintainer="Hampshire Bin Platform Team"
LABEL org.opencontainers.image.title="Hampshire Bin Platform API"
LABEL org.opencontainers.image.description="Production API for Hampshire bin collection schedules"
LABEL org.opencontainers.image.source="https://github.com/yourorg/hampshire-bin-platform"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_COMMIT}"
LABEL security.no-new-privileges="true"
