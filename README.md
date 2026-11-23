---
title: ArduSim Compiler
emoji: ⚡
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# ArduSim

Simulator Arduino berbasis **Web App + PWA** yang dirancang **touch-first** untuk Android, iPhone, iPad, tablet, dan desktop, dengan simulasi 100% di browser (`avr8js`) dan hosting **Rp 0**.

## Fitur Lengkap (Fase 0 + Fase 1 + Fase 2 + Fase 3)
- **3 Board Arduino AVR** berjalan langsung di Web Worker browser (`avr8js` 16 MHz, GPIO, PWM, ADC, Timer, USART Serial, Hardware I2C/TWI, dan Hardware SPI):
  - **Arduino Uno** (ATmega328P: D0-D13, A0-A5, I2C A4/A5, SPI D10-D13)
  - **Arduino Nano** (ATmega328P ringkas: D0-D13, A0-A7 termasuk analog A6/A7)
  - **Arduino Mega 2560** (ATmega2560: 256 KB flash, D0-D53, A0-A15, 4 UART, Timers 0-5, I2C D20/D21, SPI D50-D53)
- **Touch-First Circuit Canvas + Auto-Rapikan Kabel:**
  - 4 mode interaksi dengan ikon dan petunjuk jelas: **Pintar (`Auto`)**, **Kabel (`Wire`)**, **Geser (`Move`)**, dan **Hapus (`Delete`)**.
  - **Auto-Rapikan Kabel (`Rapikan` / `Tidy Wires`):** Router A* ortogonal otomatis menghindari badan board/komponen dan memisahkan kabel sejajar ke jalur rapi (juga otomatis berjalan saat menggambar kabel baru atau memindah komponen).
  - *Tap-to-Connect*, radius tangkap pin `30px` layar, pill label pin di atas jari, highlight kontinuitas strip breadboard & net listrik, 2 jari pinch-zoom/pan, Undo/Redo.
- **30 Komponen (Aktif, Pasif Kustom, Sensor, Layar, SPI/UART, dan Motor):**
  - **Pasif Kustom:** Resistor (`Ω/kΩ/MΩ` + 4 pita warna EIA), Kapasitor (`pF/nF/µF/mF`, keramik/elektrolit + RC Backward-Euler), Dioda (`1N4007`, Schottky `1N5819`, Zener, `Vf` kustom).
  - **Sensor & Komunikasi:** Ultrasonik HC-SR04 (`pulseIn`), DHT22/DHT11 (`DHT.h`), PIR Motion, LDR Photoresistor (lux), LM35 (`10 mV/°C`), MQ-2 Gas (`AOUT`/`DOUT`), **DS3231 RTC** (`RTClib`), **MPU6050 IMU** (pitch/roll), **RFID RC522** (`MFRC522` SPI + kartu UID virtual), **GPS NEO-6M** (NMEA-0183 UART), **Bluetooth HC-05** (terminal kirim/terima 9600 baud).
  - **Layar & Output:** LCD 16x2 I2C (`LiquidCrystal_I2C`), OLED SSD1306 128x64 (`Adafruit_SSD1306`), **Matriks LED 8x8 MAX7219** (`LedControl`/SPI), 7-Segment 1 Digit, LED 5mm (deteksi overcurrent > 30 mA), LED RGB, **NeoPixel WS2812B 8 LED** (`Adafruit_NeoPixel`), Buzzer Piezo (Hz + Web Audio), Modul Relay 5V SPDT.
  - **Input & Motor:** Breadboard Half-Size, Pushbutton (momentary + kunci tahan), Potensiometer, Keypad 4x4, Servo SG90 (`Servo.h`), Motor DC, **Motor Stepper 4-Fase** (`Stepper.h`).
- **Editor Kode Ramah Mobile:** CodeMirror 6 C++ + bar tombol simbol cepat (`{ } ( ) ; = // < > " #`).
- **Offline-First + Bilingual ID/EN + Tema Terang/Gelap:**
  - 10 template bawaan (mencakup Uno, Nano, dan Mega 2560) dilengkapi `.hex` precompiled sehingga langsung berjalan 100% offline.
  - Proyek tersimpan lokal di `IndexedDB`, cache `.hex` otomatis, ekspor/impor `.json`, dan impor `.hex`.

## Menjalankan Lokal (Desktop + Tes dari HP via WiFi LAN)

```bash
npm install
npm run build
npm test
```

Jalankan compiler backend & frontend dev server (bisa diakses dari HP di jaringan WiFi yang sama lewat IP LAN):

```bash
# Terminal 1: Backend compiler (port 7860)
npm run dev:compiler

# Terminal 2: Frontend PWA (port 5173, exposed to LAN)
npm run dev:web
```

Buka `http://<IP-LAN-PC>:5173` di Chrome Android atau Safari iPhone/iPad, lalu gunakan **Add to Home Screen** untuk mode aplikasi penuh (PWA).

## Deploy Gratis (Rp 0 Tanpa Kartu Kredit)
Ikuti panduan langkah demi langkah lengkap di [DEPLOY.md](./DEPLOY.md) (GitHub -> **Cloudflare Pages** untuk Frontend PWA + **Render Free Docker (`render.yaml`)** untuk Compiler API).

Lihat roadmap lengkap di [ROADMAP.md](./ROADMAP.md) dan panduan desain di [DESIGN.md](./DESIGN.md).
