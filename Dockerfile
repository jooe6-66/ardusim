# Stage 1: Build TypeScript packages (includes devDependencies & test peer packages)
FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/sim-core ./packages/sim-core
COPY packages/parts ./packages/parts
COPY apps/compiler ./apps/compiler

RUN npm install --workspace=@ardusim/sim-core --workspace=@ardusim/parts --workspace=@ardusim/compiler --include=dev \
    && npm run build --workspace=@ardusim/sim-core \
    && npm run build --workspace=@ardusim/parts \
    && npm run build --workspace=@ardusim/compiler \
    && npm prune --omit=dev \
    && rm -rf node_modules/@ardusim/parts

# Stage 2: Minimal runtime (Node 22 + arduino-cli + arduino:avr + 10 libraries + prod deps only)
FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli and prepare non-root app dir (UID/GID 10001 for Choreo compatibility)
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh \
    && groupadd --gid 10001 ardusim \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/ardusim --shell /bin/sh ardusim \
    && mkdir -p /home/ardusim/app \
    && chown -R 10001:10001 /home/ardusim

USER 10001
ENV HOME=/home/ardusim
WORKDIR /home/ardusim/app

RUN arduino-cli config init \
    && arduino-cli config set build_cache.path /home/ardusim/.arduino15/build-cache \
    && arduino-cli config set build_cache.ttl 87600h \
    && arduino-cli config set build_cache.compilations_before_purge 0 \
    && arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli lib install "Servo" "Stepper" "LiquidCrystal I2C" "DHT sensor library" "Adafruit SSD1306" "Adafruit GFX Library" "Adafruit NeoPixel" "MFRC522" "RTClib" "LedControl" \
    && mkdir -p /home/ardusim/.arduino15/build-cache /tmp/prewarm \
    && printf 'void setup() {}\nvoid loop() {}\n' > /tmp/prewarm/prewarm.ino \
    && for fqbn in arduino:avr:uno arduino:avr:nano arduino:avr:mega; do \
         arduino-cli compile --fqbn "$fqbn" /tmp/prewarm >/dev/null; \
       done \
    && rm -rf /tmp/prewarm /home/ardusim/.arduino15/build-cache/sketches /home/ardusim/.arduino15/staging

COPY --chown=10001:10001 --from=builder /app/package.json ./
COPY --chown=10001:10001 --from=builder /app/node_modules ./node_modules
COPY --chown=10001:10001 --from=builder /app/packages/sim-core/package.json ./packages/sim-core/package.json
COPY --chown=10001:10001 --from=builder /app/packages/sim-core/dist ./packages/sim-core/dist
COPY --chown=10001:10001 --from=builder /app/apps/compiler/package.json ./apps/compiler/package.json
COPY --chown=10001:10001 --from=builder /app/apps/compiler/dist/src ./apps/compiler/dist/src

ENV NODE_ENV=production
ENV HOME=/home/ardusim
ENV PORT=8080
ENV HOST=0.0.0.0
ENV MAX_CONCURRENT_COMPILES=1
ENV MAX_QUEUE_SIZE=24
ENV RATE_LIMIT_PER_MIN=120
ENV COMPILE_TIMEOUT_MS=60000
ENV NODE_OPTIONS=--max-old-space-size=192
ENV ARDUINO_BUILD_CACHE_PATH=/home/ardusim/.arduino15/build-cache

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null || exit 1'
CMD ["node", "apps/compiler/dist/src/server.js"]
