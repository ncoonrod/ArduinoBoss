# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer when source changes but deps don't).
COPY package.json package-lock.json ./
RUN npm ci

# TypeScript is needed at build time but isn't reliably present in the project's
# node_modules across environments, so install it globally in the build stage.
# It's a build-only tool — the runtime image below doesn't include it.
RUN npm install -g typescript

# Copy source and build:
#   npm run build      → transpile TypeScript to ./build/
#   npm run build-web  → regenerate the auto-generated browser API client
COPY . .
RUN npm run build && npm run build-web

# ---------- Runtime stage ----------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
# We don't use a database. Tell HotStaq not to try to connect to one.
ENV DATABASE_DISABLE=1

# Install only runtime dependencies (no devDependencies, no build tools).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Bring over the built JS, static assets, and the HotStaq site config.
COPY --from=builder /app/build       ./build
COPY --from=builder /app/public      ./public
COPY --from=builder /app/HotSite.json ./HotSite.json

EXPOSE 8080

# Same arguments as `npm run start` — single port for HTTP + WebSocket.
CMD ["node", "./build/cli.js", \
     "--hotsite", "./HotSite.json", "run", \
     "--server-type", "web-api", \
     "--api-http-port", "8080", \
     "--web-http-port", "8080", \
     "--ws"]

# ---------- Notes ----------
# Build:   docker build -t arduinoboss .
# Run:     docker run --rm -p 8080:8080 arduinoboss
# Open:    http://localhost:8080
#
# Why one image and not two (nginx + node)?
# HotStaq processes .hott files at request time and injects a bootstrap loader
# into the response. nginx can't run that processor, so even in a "two-image"
# setup nginx would just be a reverse proxy in front of this same Node app.
# If you want TLS termination, gzip, or static-asset caching, put nginx (or
# Caddy with auto-TLS) in front of THIS container — they don't replace it.
