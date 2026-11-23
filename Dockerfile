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
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli and prepare non-root app dir (built-in `node` user is UID 1000)
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh \
    && mkdir -p /home/node/app \
    && chown node:node /home/node/app

USER node
WORKDIR /home/node/app

RUN arduino-cli config init \
    && arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli lib install "Servo" "Stepper" "LiquidCrystal I2C" "DHT sensor library" "Adafruit SSD1306" "Adafruit GFX Library" "Adafruit NeoPixel" "MFRC522" "RTClib" "LedControl" \
    && rm -rf /home/node/.arduino15/staging

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/sim-core/package.json ./packages/sim-core/package.json
COPY --chown=node:node --from=builder /app/packages/sim-core/dist ./packages/sim-core/dist
COPY --chown=node:node --from=builder /app/apps/compiler/package.json ./apps/compiler/package.json
COPY --chown=node:node --from=builder /app/apps/compiler/dist/src ./apps/compiler/dist/src

ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0
ENV MAX_CONCURRENT_COMPILES=2
ENV MAX_QUEUE_SIZE=24
ENV RATE_LIMIT_PER_MIN=120
ENV COMPILE_TIMEOUT_MS=30000

EXPOSE 7860
CMD ["node", "apps/compiler/dist/src/server.js"]
