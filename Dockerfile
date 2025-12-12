# Multi-stage build for cloudflare-updater CLI
FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production

# Enable corepack for pnpm
RUN corepack enable

# Install dependencies (skip lifecycle scripts to avoid git/lefthook requirements)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy sources and build
COPY . .
RUN pnpm build

# Prune dev dependencies for runtime
RUN pnpm prune --prod --ignore-scripts

# Runtime image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app
RUN corepack enable

# Copy only runtime artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

USER app
ENTRYPOINT ["node", "dist/index.js"]
