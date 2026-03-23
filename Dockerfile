# Multi-stage build for cloudflare-updater CLI
FROM oven/bun:1.3.11-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies (skip lifecycle scripts to avoid git/lefthook requirements)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# Copy sources and build
COPY . .
RUN bun run build

# Prune dev dependencies for runtime
RUN bun install --frozen-lockfile --production --ignore-scripts

# Runtime image
FROM oven/bun:1.3.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# Copy only runtime artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json bun.lock ./

USER app
ENTRYPOINT ["bun", "dist/index.js"]
