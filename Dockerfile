# ArduSim Compiler Image (Node 22 + arduino-cli + arduino:avr + 10 libraries)
FROM node:22-bookworm-slim

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
    && arduino-cli lib install "Servo" "Stepper" "LiquidCrystal I2C" "DHT sensor library" "Adafruit SSD1306" "Adafruit GFX Library" "Adafruit NeoPixel" "MFRC522" "RTClib" "LedControl"

COPY --chown=node:node package.json tsconfig.base.json ./
COPY --chown=node:node packages/sim-core ./packages/sim-core
COPY --chown=node:node packages/parts ./packages/parts
COPY --chown=node:node apps/compiler ./apps/compiler

RUN npm install --workspace=@ardusim/sim-core --workspace=@ardusim/parts --workspace=@ardusim/compiler --include=dev \
    && npm run build --workspace=@ardusim/sim-core \
    && npm run build --workspace=@ardusim/parts \
    && npm run build --workspace=@ardusim/compiler

ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0
ENV MAX_CONCURRENT_COMPILES=1

EXPOSE 7860
CMD ["node", "apps/compiler/dist/src/server.js"]
