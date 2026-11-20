# ArduSim Compiler Image
# Works both as a local Docker sandbox and directly on Hugging Face Spaces (Docker SDK, port 7860).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli and pre-cache arduino:avr core (Uno, Nano, Mega 2560)
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh

RUN useradd -m -u 1000 ardusim
USER ardusim
WORKDIR /home/ardusim/app

RUN arduino-cli config init \
    && arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli lib install "Servo" "Stepper" "LiquidCrystal I2C" "DHT sensor library" "Adafruit SSD1306" "Adafruit GFX Library" "Adafruit NeoPixel" "MFRC522" "RTClib" "LedControl"

COPY --chown=ardusim:ardusim package.json tsconfig.base.json ./
COPY --chown=ardusim:ardusim packages/sim-core ./packages/sim-core
COPY --chown=ardusim:ardusim packages/parts ./packages/parts
COPY --chown=ardusim:ardusim apps/compiler ./apps/compiler

RUN npm install --workspace=@ardusim/sim-core --workspace=@ardusim/parts --workspace=@ardusim/compiler --include=dev \
    && npm run build --workspace=@ardusim/sim-core \
    && npm run build --workspace=@ardusim/parts \
    && npm run build --workspace=@ardusim/compiler

ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0

EXPOSE 7860
CMD ["node", "apps/compiler/dist/src/server.js"]
