FROM node:22-bookworm-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh \
  && groupadd -g 10001 ardusim && useradd -u 10001 -g 10001 -m -d /home/ardusim -s /bin/sh ardusim \
  && mkdir -p /home/ardusim/app && chown -R 10001:10001 /home/ardusim

USER 10001
ENV HOME=/home/ardusim ARDUINO_BUILD_CACHE_PATH=/home/ardusim/.arduino15/build-cache
WORKDIR /home/ardusim/app

RUN c="$ARDUINO_BUILD_CACHE_PATH" \
  && arduino-cli config init && arduino-cli config set build_cache.path "$c" \
  && arduino-cli config set build_cache.ttl 87600h && arduino-cli config set build_cache.compilations_before_purge 0 \
  && arduino-cli core update-index && arduino-cli core install arduino:avr \
  && arduino-cli lib install "Servo" "Stepper" "LiquidCrystal I2C" "DHT sensor library" "Adafruit SSD1306" "Adafruit GFX Library" "Adafruit NeoPixel" "MFRC522" "RTClib" "LedControl" \
  && mkdir -p "$c" /tmp/prewarm && printf 'void setup() {}\nvoid loop() {}\n' > /tmp/prewarm/prewarm.ino \
  && for b in uno nano mega; do arduino-cli compile --fqbn "arduino:avr:$b" /tmp/prewarm >/dev/null || exit 1; done \
  && rm -rf /tmp/prewarm "$c/sketches" "$HOME/.arduino15/staging"

COPY --chown=10001:10001 package.json tsconfig.base.json ./
COPY --chown=10001:10001 packages/sim-core ./packages/sim-core
COPY --chown=10001:10001 packages/parts ./packages/parts
COPY --chown=10001:10001 apps/compiler ./apps/compiler

RUN npm install --no-audit --no-fund -w @ardusim/sim-core -w @ardusim/parts -w @ardusim/compiler --include=dev \
  && for w in sim-core parts compiler; do npm run build -w "@ardusim/$w" || exit 1; done \
  && npm prune --omit=dev \
  && rm -rf node_modules/@ardusim/parts packages/parts packages/sim-core/dist/test apps/compiler/dist/test "$HOME/.npm" \
  && find . -name '*.tsbuildinfo' -delete

ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 MAX_CONCURRENT_COMPILES=1 MAX_QUEUE_SIZE=24 RATE_LIMIT_PER_MIN=120 COMPILE_TIMEOUT_MS=60000 NODE_OPTIONS=--max-old-space-size=192
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null || exit 1'
CMD ["node", "apps/compiler/dist/src/server.js"]
