import { CircuitDiagram } from '@ardusim/sim-core';
import { PRECOMPILED_TEMPLATE_HEX } from './precompiledHex';

export interface StarterTemplate {
  id: string;
  title: { id: string; en: string };
  summary: { id: string; en: string };
  diagram: CircuitDiagram;
  /** Precompiled ATmega328P Intel HEX so starter demos run 100% offline */
  precompiledHex?: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'tpl-blink-led',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-blink-led'],
    title: {
      id: 'Blink LED + Resistor 220 Ω + Serial',
      en: 'LED Blink + 220 Ω Resistor + Serial',
    },
    summary: {
      id: 'Rangkaian dasar D13 ke LED lewat resistor pembatas arus 220 Ω dan log Serial Monitor.',
      en: 'Classic D13 LED circuit with a 220 Ω current-limiting resistor and Serial Monitor output.',
    },
    diagram: {
      version: 1,
      id: 'tpl-blink-led',
      name: 'Blink LED 220 Ohm',
      board: 'arduino-uno',
      updatedAt: 1,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 48, y: 156, rotation: 0, props: {} },
        { id: 'r1', type: 'resistor', x: 372, y: 156, rotation: 0, props: { value: 220, unit: 'ohm' } },
        { id: 'led1', type: 'led', x: 492, y: 132, rotation: 0, props: { color: 'red' } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '13' }, to: { partId: 'r1', pinId: '1' }, color: '#D97706' },
        { id: 'w2', from: { partId: 'r1', pinId: '2' }, to: { partId: 'led1', pinId: 'A' }, color: '#DC2626' },
        { id: 'w3', from: { partId: 'led1', pinId: 'C' }, to: { partId: 'uno1', pinId: 'GND.1' }, color: '#1F2937' },
      ],
      sketch: `// ArduSim: Blink LED + Serial Monitor
const int LED_PIN = 13;
int count = 0;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("ArduSim Uno ready");
}

void loop() {
  count++;
  digitalWrite(LED_PIN, HIGH);
  Serial.print("LED ON  #");
  Serial.println(count);
  delay(500);

  digitalWrite(LED_PIN, LOW);
  Serial.print("LED OFF #");
  Serial.println(count);
  delay(500);
}
`,
    },
  },
  {
    id: 'tpl-button-diode',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-button-diode'],
    title: {
      id: 'Tombol Tekan + Dioda 1N4007 + LED',
      en: 'Pushbutton + 1N4007 Diode + LED',
    },
    summary: {
      id: 'Tekan tombol di D2 (INPUT_PULLUP) untuk menyalakan LED lewat dioda penyearah 1N4007 dan resistor 220 Ω.',
      en: 'Press the D2 pushbutton (INPUT_PULLUP) to drive an LED through a 1N4007 diode and 220 Ω resistor.',
    },
    diagram: {
      version: 1,
      id: 'tpl-button-diode',
      name: 'Button & Diode',
      board: 'arduino-uno',
      updatedAt: 2,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 156, rotation: 0, props: {} },
        { id: 'btn1', type: 'pushbutton', x: 372, y: 264, rotation: 0, props: { color: 'teal', locked: false } },
        { id: 'd1', type: 'diode', x: 360, y: 132, rotation: 0, props: { model: '1N4007', vf: 0.7, zenerVz: 3.3 } },
        { id: 'r1', type: 'resistor', x: 468, y: 132, rotation: 0, props: { value: 220, unit: 'ohm' } },
        { id: 'led1', type: 'led', x: 576, y: 108, rotation: 0, props: { color: 'green' } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '2' }, to: { partId: 'btn1', pinId: '1a' }, color: '#0F6660' },
        { id: 'w2', from: { partId: 'btn1', pinId: '2b' }, to: { partId: 'uno1', pinId: 'GND.2' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'uno1', pinId: '8' }, to: { partId: 'd1', pinId: 'A' }, color: '#2563EB' },
        { id: 'w4', from: { partId: 'd1', pinId: 'C' }, to: { partId: 'r1', pinId: '1' }, color: '#D97706' },
        { id: 'w5', from: { partId: 'r1', pinId: '2' }, to: { partId: 'led1', pinId: 'A' }, color: '#16A34A' },
        { id: 'w6', from: { partId: 'led1', pinId: 'C' }, to: { partId: 'uno1', pinId: 'GND.1' }, color: '#1F2937' },
      ],
      sketch: `// Pushbutton (D2, INPUT_PULLUP) + Diode 1N4007 + LED (D8)
const int BTN_PIN = 2;
const int LED_PIN = 8;
int lastState = HIGH;

void setup() {
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Press pushbutton on D2");
}

void loop() {
  int pressed = (digitalRead(BTN_PIN) == LOW);
  digitalWrite(LED_PIN, pressed ? HIGH : LOW);

  if (pressed != lastState) {
    lastState = pressed;
    Serial.println(pressed ? "Button PRESSED -> LED ON" : "Button RELEASED -> LED OFF");
  }
  delay(20);
}
`,
    },
  },
  {
    id: 'tpl-pot-rc-pwm',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-pot-rc-pwm'],
    title: {
      id: 'Potensiometer + Filter RC Kapasitor 100 µF + PWM LED',
      en: 'Potentiometer + 100 µF RC Filter + PWM LED',
    },
    summary: {
      id: 'Putar potensiometer di A0 untuk mengatur kecerahan PWM LED di D9 dan mengamati pengisian kapasitor 100 µF.',
      en: 'Turn the A0 potentiometer to control PWM LED brightness on D9 while observing a 100 µF RC filter capacitor.',
    },
    diagram: {
      version: 1,
      id: 'tpl-pot-rc-pwm',
      name: 'Potentiometer + RC Filter',
      board: 'arduino-uno',
      updatedAt: 3,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 156, rotation: 0, props: {} },
        { id: 'pot1', type: 'potentiometer', x: 372, y: 276, rotation: 0, props: { value: 10, unit: 'kohm', position: 0.65 } },
        { id: 'r1', type: 'resistor', x: 372, y: 132, rotation: 0, props: { value: 220, unit: 'ohm' } },
        { id: 'led1', type: 'led', x: 492, y: 108, rotation: 0, props: { color: 'blue' } },
        { id: 'r2', type: 'resistor', x: 372, y: 192, rotation: 0, props: { value: 1, unit: 'kohm' } },
        { id: 'c1', type: 'capacitor', x: 492, y: 180, rotation: 0, props: { value: 100, unit: 'uf', kind: 'electrolytic' } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'pot1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'uno1', pinId: 'GND.2' }, to: { partId: 'pot1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'pot1', pinId: 'SIG' }, to: { partId: 'uno1', pinId: 'A0' }, color: '#7C3AED' },
        { id: 'w4', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'r1', pinId: '1' }, color: '#2563EB' },
        { id: 'w5', from: { partId: 'r1', pinId: '2' }, to: { partId: 'led1', pinId: 'A' }, color: '#2563EB' },
        { id: 'w6', from: { partId: 'led1', pinId: 'C' }, to: { partId: 'uno1', pinId: 'GND.1' }, color: '#1F2937' },
        { id: 'w7', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'r2', pinId: '1' }, color: '#0F6660' },
        { id: 'w8', from: { partId: 'r2', pinId: '2' }, to: { partId: 'c1', pinId: '1' }, color: '#0F6660' },
        { id: 'w9', from: { partId: 'c1', pinId: '2' }, to: { partId: 'uno1', pinId: 'GND.3' }, color: '#1F2937' },
      ],
      sketch: `// Potentiometer (A0) -> PWM LED & RC Capacitor Filter (D9)
const int POT_PIN = A0;
const int PWM_PIN = 9;

void setup() {
  pinMode(PWM_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Turn potentiometer to adjust PWM");
}

void loop() {
  int raw = analogRead(POT_PIN);
  int pwm = map(raw, 0, 1023, 0, 255);
  analogWrite(PWM_PIN, pwm);

  Serial.print("ADC=");
  Serial.print(raw);
  Serial.print("  PWM=");
  Serial.println(pwm);
  delay(250);
}
`,
    },
  },
  {
    id: 'tpl-ultrasonic-lcd-servo',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-ultrasonic-lcd-servo'],
    title: {
      id: 'Radar Jarak HC-SR04 + Servo SG90 + LCD 16x2 I2C',
      en: 'HC-SR04 Distance + SG90 Servo + 16x2 I2C LCD',
    },
    summary: {
      id: 'Geser jarak HC-SR04 di Properti: LCD 16x2 I2C tampilkan jarak cm dan Servo SG90 bergerak otomatis.',
      en: 'Slide HC-SR04 distance in Inspector: 16x2 I2C LCD displays cm and SG90 Servo tracks the distance.',
    },
    diagram: {
      version: 1,
      id: 'tpl-ultrasonic-lcd-servo',
      name: 'Ultrasonic + LCD + Servo',
      board: 'arduino-uno',
      updatedAt: 4,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 168, rotation: 0, props: {} },
        { id: 'us1', type: 'hc-sr04', x: 360, y: 84, rotation: 0, props: { distanceCm: 42 } },
        { id: 'srv1', type: 'servo', x: 504, y: 72, rotation: 0, props: {} },
        { id: 'lcd1', type: 'lcd-1602-i2c', x: 384, y: 216, rotation: 0, props: { i2cAddress: 0x27, color: 'green' } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'us1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'uno1', pinId: 'GND.1' }, to: { partId: 'us1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'uno1', pinId: '7' }, to: { partId: 'us1', pinId: 'TRIG' }, color: '#16A34A' },
        { id: 'w4', from: { partId: 'uno1', pinId: '6' }, to: { partId: 'us1', pinId: 'ECHO' }, color: '#2563EB' },
        { id: 'w5', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'srv1', pinId: 'SIG' }, color: '#D97706' },
        { id: 'w6', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'srv1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w7', from: { partId: 'uno1', pinId: 'GND.2' }, to: { partId: 'srv1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w8', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'lcd1', pinId: 'SDA' }, color: '#0F6660' },
        { id: 'w9', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'lcd1', pinId: 'SCL' }, color: '#7C3AED' },
        { id: 'w10', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'lcd1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w11', from: { partId: 'uno1', pinId: 'GND.3' }, to: { partId: 'lcd1', pinId: 'GND' }, color: '#1F2937' },
      ],
      sketch: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo gateServo;

const int TRIG_PIN = 7;
const int ECHO_PIN = 6;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  gateServo.attach(9);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("ArduSim Radar   ");
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  int cm = dur / 58;
  int angle = constrain(map(cm, 10, 150, 180, 0), 0, 180);
  gateServo.write(angle);

  lcd.setCursor(0, 1);
  lcd.print("D:");
  lcd.print(cm);
  lcd.print("cm S:");
  lcd.print(angle);
  lcd.print("deg   ");

  Serial.print("Distance=");
  Serial.print(cm);
  Serial.print("cm  Servo=");
  Serial.println(angle);
  delay(120);
}
`,
    },
  },
  {
    id: 'tpl-mega-oled-dht',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-mega-oled-dht'],
    title: {
      id: 'Mega 2560: Stasiun Cuaca DHT22 + OLED SSD1306',
      en: 'Mega 2560: DHT22 Weather + SSD1306 OLED',
    },
    summary: {
      id: 'Arduino Mega 2560 membaca suhu & kelembapan DHT22 lalu menggambar grafik ke OLED 128x64 I2C (D20/D21).',
      en: 'Arduino Mega 2560 reads DHT22 temperature & humidity and renders live text on 128x64 I2C OLED (D20/D21).',
    },
    diagram: {
      version: 1,
      id: 'tpl-mega-oled-dht',
      name: 'Mega OLED Weather',
      board: 'arduino-mega',
      updatedAt: 5,
      parts: [
        { id: 'mega1', type: 'arduino-mega', x: 24, y: 156, rotation: 0, props: {} },
        { id: 'dht1', type: 'dht22', x: 504, y: 120, rotation: 0, props: { model: 'DHT22', tempC: 27.5, humidityPct: 62 } },
        { id: 'oled1', type: 'oled-ssd1306', x: 504, y: 240, rotation: 0, props: { i2cAddress: 0x3c } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'mega1', pinId: '5V' }, to: { partId: 'dht1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'mega1', pinId: 'GND.1' }, to: { partId: 'dht1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'mega1', pinId: '4' }, to: { partId: 'dht1', pinId: 'DATA' }, color: '#16A34A' },
        { id: 'w4', from: { partId: 'mega1', pinId: '5V' }, to: { partId: 'oled1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w5', from: { partId: 'mega1', pinId: 'GND.2' }, to: { partId: 'oled1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w6', from: { partId: 'mega1', pinId: '20' }, to: { partId: 'oled1', pinId: 'SDA' }, color: '#0F6660' },
        { id: 'w7', from: { partId: 'mega1', pinId: '21' }, to: { partId: 'oled1', pinId: 'SCL' }, color: '#7C3AED' },
      ],
      sketch: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
DHT dht(4, DHT22);

void setup() {
  Serial.begin(9600);
  dht.begin();
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ArduSim Mega 2560");
  display.println("Reading DHT22...");
  display.display();
}

void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("MEGA 2560 WEATHER");
  display.drawFastHLine(0, 12, 128, SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 20);
  display.print(t, 1);
  display.println(" C");

  display.setCursor(0, 44);
  display.print(h, 0);
  display.println(" %RH");
  display.display();

  Serial.print("T=");
  Serial.print(t, 1);
  Serial.print("C  H=");
  Serial.print(h, 0);
  Serial.println("%");
  delay(500);
}
`,
    },
  },
  {
    id: 'tpl-rfid-neopixel',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-rfid-neopixel'],
    title: {
      id: 'Akses RFID RC522 + NeoPixel 8 LED + Buzzer',
      en: 'RC522 RFID Access + 8-LED NeoPixel + Buzzer',
    },
    summary: {
      id: 'Ketuk RC522 di kanvas lalu tekan Tempel Kartu RFID di Properti: NeoPixel menyala hijau & UID tercetak di Serial.',
      en: 'Tap RC522 on canvas and press Tap RFID Card in Inspector: NeoPixel lights green and UID prints to Serial.',
    },
    diagram: {
      version: 1,
      id: 'tpl-rfid-neopixel',
      name: 'RFID + NeoPixel Access',
      board: 'arduino-uno',
      updatedAt: 6,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 180, rotation: 0, props: {} },
        { id: 'rf1', type: 'rfid-rc522', x: 384, y: 84, rotation: 0, props: { cardPresent: false, uid: 'DEADBEEF' } },
        { id: 'np1', type: 'neopixel-strip', x: 384, y: 276, rotation: 0, props: {} },
        { id: 'bz1', type: 'buzzer', x: 540, y: 120, rotation: 0, props: {} },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '10' }, to: { partId: 'rf1', pinId: 'SDA' }, color: '#2563EB' },
        { id: 'w2', from: { partId: 'uno1', pinId: '13' }, to: { partId: 'rf1', pinId: 'SCK' }, color: '#16A34A' },
        { id: 'w3', from: { partId: 'uno1', pinId: '11' }, to: { partId: 'rf1', pinId: 'MOSI' }, color: '#D97706' },
        { id: 'w4', from: { partId: 'uno1', pinId: '12' }, to: { partId: 'rf1', pinId: 'MISO' }, color: '#7C3AED' },
        { id: 'w5', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'rf1', pinId: 'RST' }, color: '#EA580C' },
        { id: 'w6', from: { partId: 'uno1', pinId: '3.3V' }, to: { partId: 'rf1', pinId: '3.3V' }, color: '#DC2626' },
        { id: 'w7', from: { partId: 'uno1', pinId: 'GND.1' }, to: { partId: 'rf1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w8', from: { partId: 'uno1', pinId: '6' }, to: { partId: 'np1', pinId: 'DIN' }, color: '#0F6660' },
        { id: 'w9', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'np1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w10', from: { partId: 'uno1', pinId: 'GND.2' }, to: { partId: 'np1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w11', from: { partId: 'uno1', pinId: '8' }, to: { partId: 'bz1', pinId: '+' }, color: '#D97706' },
        { id: 'w12', from: { partId: 'uno1', pinId: 'GND.3' }, to: { partId: 'bz1', pinId: '-' }, color: '#1F2937' },
      ],
      sketch: `#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_NeoPixel.h>

MFRC522 rfid(10, 9);
Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);
const int BUZZER_PIN = 8;

void setAll(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < 8; i++) strip.setPixelColor(i, strip.Color(r, g, b));
  strip.show();
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  strip.begin();
  setAll(20, 40, 120); // Standby blue
  Serial.println("RFID ready: tap card in Inspector");
}

void loop() {
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    Serial.print("Card UID: ");
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) Serial.print("0");
      Serial.print(rfid.uid.uidByte[i], HEX);
    }
    Serial.println(" -> ACCESS GRANTED");
    setAll(0, 220, 80);
    tone(BUZZER_PIN, 1200, 150);
    delay(600);
    setAll(20, 40, 120);
  }
  delay(50);
}
`,
    },
  },
  {
    id: 'tpl-nano-gas-relay',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-nano-gas-relay'],
    title: {
      id: 'Arduino Nano: Detektor Gas MQ-2 + Relay 5V + LED RGB',
      en: 'Arduino Nano: MQ-2 Gas Detector + 5V Relay + RGB LED',
    },
    summary: {
      id: 'Geser konsentrasi gas MQ-2 di Properti: saat melewati ambang, Relay 5V aktif dan LED RGB berubah dari hijau ke merah.',
      en: 'Slide MQ-2 gas concentration in Inspector: crossing the threshold energizes the 5V Relay and switches the RGB LED red.',
    },
    diagram: {
      version: 1,
      id: 'tpl-nano-gas-relay',
      name: 'Nano MQ-2 Gas Alarm',
      board: 'arduino-nano',
      updatedAt: 7,
      parts: [
        { id: 'nano1', type: 'arduino-nano', x: 48, y: 180, rotation: 0, props: {} },
        { id: 'mq1', type: 'mq2', x: 348, y: 96, rotation: 0, props: { gasPct: 22, thresholdPct: 50 } },
        { id: 'rel1', type: 'relay', x: 348, y: 228, rotation: 0, props: { activeLow: false } },
        { id: 'rgb1', type: 'rgb-led', x: 492, y: 132, rotation: 0, props: { common: 'cathode' } },
        { id: 'r1', type: 'resistor', x: 480, y: 228, rotation: 0, props: { value: 220, unit: 'ohm' } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'nano1', pinId: '5V' }, to: { partId: 'mq1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'nano1', pinId: 'GND.1' }, to: { partId: 'mq1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'mq1', pinId: 'AOUT' }, to: { partId: 'nano1', pinId: 'A6' }, color: '#7C3AED' },
        { id: 'w4', from: { partId: 'nano1', pinId: '5V' }, to: { partId: 'rel1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w5', from: { partId: 'nano1', pinId: 'GND.2' }, to: { partId: 'rel1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w6', from: { partId: 'nano1', pinId: '7' }, to: { partId: 'rel1', pinId: 'IN' }, color: '#D97706' },
        { id: 'w7', from: { partId: 'nano1', pinId: '9' }, to: { partId: 'rgb1', pinId: 'R' }, color: '#DC2626' },
        { id: 'w8', from: { partId: 'nano1', pinId: '10' }, to: { partId: 'rgb1', pinId: 'G' }, color: '#16A34A' },
        { id: 'w9', from: { partId: 'rgb1', pinId: 'COM' }, to: { partId: 'r1', pinId: '1' }, color: '#1F2937' },
        { id: 'w10', from: { partId: 'r1', pinId: '2' }, to: { partId: 'nano1', pinId: 'GND.2' }, color: '#1F2937' },
      ],
      sketch: `// Arduino Nano: MQ-2 Gas Sensor (A6) + 5V Relay (D7) + RGB LED (D9/D10)
const int GAS_PIN = A6;
const int RELAY_PIN = 7;
const int RED_PIN = 9;
const int GREEN_PIN = 10;

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Nano MQ-2 Gas Monitor ready");
}

void loop() {
  int raw = analogRead(GAS_PIN);
  bool alarm = raw > 500;
  digitalWrite(RELAY_PIN, alarm ? HIGH : LOW);
  analogWrite(RED_PIN, alarm ? 255 : 0);
  analogWrite(GREEN_PIN, alarm ? 0 : 200);

  Serial.print("MQ2_ADC=");
  Serial.print(raw);
  Serial.println(alarm ? "  [ALARM! RELAY ON]" : "  [SAFE]");
  delay(250);
}
`,
    },
  },
  {
    id: 'tpl-max7219-rtc',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-max7219-rtc'],
    title: {
      id: 'Matriks LED 8x8 MAX7219 + Jam RTC DS3231',
      en: 'MAX7219 8x8 LED Matrix + DS3231 Real-Time Clock',
    },
    summary: {
      id: 'Menampilkan animasi ikon pada dot-matrix 8x8 MAX7219 dan mencetak waktu real-time DS3231 ke Serial Monitor.',
      en: 'Animates icons on an 8x8 MAX7219 dot-matrix display while reading live time from the DS3231 I2C RTC.',
    },
    diagram: {
      version: 1,
      id: 'tpl-max7219-rtc',
      name: 'MAX7219 + DS3231 Clock',
      board: 'arduino-uno',
      updatedAt: 8,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 156, rotation: 0, props: {} },
        { id: 'mx1', type: 'max7219', x: 384, y: 84, rotation: 0, props: {} },
        { id: 'rtc1', type: 'ds3231-rtc', x: 396, y: 240, rotation: 0, props: {} },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'mx1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'uno1', pinId: 'GND.1' }, to: { partId: 'mx1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'uno1', pinId: '11' }, to: { partId: 'mx1', pinId: 'DIN' }, color: '#16A34A' },
        { id: 'w4', from: { partId: 'uno1', pinId: '10' }, to: { partId: 'mx1', pinId: 'CS' }, color: '#2563EB' },
        { id: 'w5', from: { partId: 'uno1', pinId: '13' }, to: { partId: 'mx1', pinId: 'CLK' }, color: '#D97706' },
        { id: 'w6', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'rtc1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w7', from: { partId: 'uno1', pinId: 'GND.2' }, to: { partId: 'rtc1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w8', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'rtc1', pinId: 'SDA' }, color: '#0F6660' },
        { id: 'w9', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'rtc1', pinId: 'SCL' }, color: '#7C3AED' },
      ],
      sketch: `#include <Wire.h>
#include <LedControl.h>
#include <RTClib.h>

LedControl lc = LedControl(11, 13, 10, 1);
RTC_DS3231 rtc;

const byte HEART[8] = {
  B00000000,
  B01100110,
  B11111111,
  B11111111,
  B11111111,
  B01111110,
  B00111100,
  B00011000
};

const byte SMILE[8] = {
  B00111100,
  B01000010,
  B10100101,
  B10000001,
  B10100101,
  B10011001,
  B01000010,
  B00111100
};

bool toggle = false;

void drawPattern(const byte img[8]) {
  for (int r = 0; r < 8; r++) lc.setRow(0, r, img[r]);
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
  rtc.begin();
  lc.shutdown(0, false);
  lc.setIntensity(0, 8);
  lc.clearDisplay(0);
}

void loop() {
  drawPattern(toggle ? SMILE : HEART);
  toggle = !toggle;

  DateTime now = rtc.now();
  Serial.print("RTC: ");
  Serial.print(now.hour());
  Serial.print(":");
  Serial.print(now.minute());
  Serial.print(":");
  Serial.println(now.second());
  delay(800);
}
`,
    },
  },
  {
    id: 'tpl-stepper-mpu6050',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-stepper-mpu6050'],
    title: {
      id: 'Motor Stepper 4-Fase + Sensor Kemiringan MPU6050',
      en: '4-Wire Stepper Motor + MPU6050 Tilt Stabilizer',
    },
    summary: {
      id: 'Geser kemiringan Pitch pada MPU6050 di Properti untuk memutar Motor Stepper maju atau mundur secara otomatis.',
      en: 'Slide Pitch tilt on the MPU6050 IMU in Inspector to drive the 4-wire Stepper Motor clockwise or counter-clockwise.',
    },
    diagram: {
      version: 1,
      id: 'tpl-stepper-mpu6050',
      name: 'Stepper + MPU6050 Tilt',
      board: 'arduino-uno',
      updatedAt: 9,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 156, rotation: 0, props: {} },
        { id: 'st1', type: 'stepper', x: 384, y: 84, rotation: 0, props: { stepsPerRev: 200 } },
        { id: 'imu1', type: 'mpu6050', x: 384, y: 240, rotation: 0, props: { i2cAddress: 0x68, pitchDeg: 25, rollDeg: 0, tempC: 25 } },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '2' }, to: { partId: 'st1', pinId: 'IN1' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'uno1', pinId: '3' }, to: { partId: 'st1', pinId: 'IN2' }, color: '#D97706' },
        { id: 'w3', from: { partId: 'uno1', pinId: '4' }, to: { partId: 'st1', pinId: 'IN3' }, color: '#16A34A' },
        { id: 'w4', from: { partId: 'uno1', pinId: '5' }, to: { partId: 'st1', pinId: 'IN4' }, color: '#2563EB' },
        { id: 'w5', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'imu1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w6', from: { partId: 'uno1', pinId: 'GND.2' }, to: { partId: 'imu1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w7', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'imu1', pinId: 'SDA' }, color: '#0F6660' },
        { id: 'w8', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'imu1', pinId: 'SCL' }, color: '#7C3AED' },
      ],
      sketch: `#include <Wire.h>
#include <Stepper.h>

Stepper motor(200, 2, 3, 4, 5);

void setup() {
  Serial.begin(9600);
  Wire.begin();
  Wire.beginTransmission(0x68);
  Wire.write(0x6B);
  Wire.write(0); // Wake MPU6050
  Wire.endTransmission(true);
  motor.setSpeed(60);
  Serial.println("Tilt MPU6050 Pitch slider to rotate Stepper");
}

void loop() {
  Wire.beginTransmission(0x68);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(0x68, 2);
  int16_t ax = (Wire.read() << 8) | Wire.read();

  if (ax > 2000) {
    motor.step(5);
    Serial.print("Pitch + -> CW   ax=");
    Serial.println(ax);
  } else if (ax < -2000) {
    motor.step(-5);
    Serial.print("Pitch - -> CCW  ax=");
    Serial.println(ax);
  } else {
    Serial.print("Level           ax=");
    Serial.println(ax);
  }
  delay(120);
}
`,
    },
  },
  {
    id: 'tpl-pir-ldr-alarm',
    precompiledHex: PRECOMPILED_TEMPLATE_HEX['tpl-pir-ldr-alarm'],
    title: {
      id: 'Lampu & Alarm Otomatis: PIR + LDR + Buzzer',
      en: 'Smart Night Alarm: PIR Motion + LDR Light + Buzzer',
    },
    summary: {
      id: 'Turunkan cahaya LDR (< 150 lux) lalu aktifkan gerakan PIR di Properti: LED menyala dan Buzzer berbunyi.',
      en: 'Lower LDR light intensity (< 150 lux) and trigger PIR motion in Inspector: LED lights up and Buzzer sounds.',
    },
    diagram: {
      version: 1,
      id: 'tpl-pir-ldr-alarm',
      name: 'PIR + LDR Night Alarm',
      board: 'arduino-uno',
      updatedAt: 10,
      parts: [
        { id: 'uno1', type: 'arduino-uno', x: 36, y: 156, rotation: 0, props: {} },
        { id: 'pir1', type: 'pir', x: 372, y: 84, rotation: 0, props: { motion: false } },
        { id: 'ldr1', type: 'ldr', x: 372, y: 240, rotation: 0, props: { lux: 80 } },
        { id: 'r1', type: 'resistor', x: 468, y: 252, rotation: 0, props: { value: 10, unit: 'kohm' } },
        { id: 'r2', type: 'resistor', x: 480, y: 96, rotation: 0, props: { value: 220, unit: 'ohm' } },
        { id: 'led1', type: 'led', x: 588, y: 72, rotation: 0, props: { color: 'yellow' } },
        { id: 'bz1', type: 'buzzer', x: 576, y: 180, rotation: 0, props: {} },
      ],
      wires: [
        { id: 'w1', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'pir1', pinId: 'VCC' }, color: '#DC2626' },
        { id: 'w2', from: { partId: 'uno1', pinId: 'GND.1' }, to: { partId: 'pir1', pinId: 'GND' }, color: '#1F2937' },
        { id: 'w3', from: { partId: 'pir1', pinId: 'OUT' }, to: { partId: 'uno1', pinId: '2' }, color: '#D97706' },
        { id: 'w4', from: { partId: 'uno1', pinId: '5V' }, to: { partId: 'ldr1', pinId: '1' }, color: '#DC2626' },
        { id: 'w5', from: { partId: 'ldr1', pinId: '2' }, to: { partId: 'uno1', pinId: 'A0' }, color: '#7C3AED' },
        { id: 'w6', from: { partId: 'ldr1', pinId: '2' }, to: { partId: 'r1', pinId: '1' }, color: '#7C3AED' },
        { id: 'w7', from: { partId: 'r1', pinId: '2' }, to: { partId: 'uno1', pinId: 'GND.2' }, color: '#1F2937' },
        { id: 'w8', from: { partId: 'uno1', pinId: '12' }, to: { partId: 'r2', pinId: '1' }, color: '#16A34A' },
        { id: 'w9', from: { partId: 'r2', pinId: '2' }, to: { partId: 'led1', pinId: 'A' }, color: '#16A34A' },
        { id: 'w10', from: { partId: 'led1', pinId: 'C' }, to: { partId: 'uno1', pinId: 'GND.1' }, color: '#1F2937' },
        { id: 'w11', from: { partId: 'uno1', pinId: '8' }, to: { partId: 'bz1', pinId: '+' }, color: '#2563EB' },
        { id: 'w12', from: { partId: 'bz1', pinId: '-' }, to: { partId: 'uno1', pinId: 'GND.3' }, color: '#1F2937' },
      ],
      sketch: `// Smart Night Alarm: PIR (D2) + LDR Voltage Divider (A0) + LED (D12) + Buzzer (D8)
const int PIR_PIN = 2;
const int LDR_PIN = A0;
const int LED_PIN = 12;
const int BUZZER_PIN = 8;

void setup() {
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Night Alarm active: lower LDR lux & toggle PIR");
}

void loop() {
  int lightAdc = analogRead(LDR_PIN); // Higher voltage = brighter light
  bool isDark = lightAdc < 650;
  bool motion = digitalRead(PIR_PIN) == HIGH;

  if (isDark && motion) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 1400, 150);
    Serial.println("INTRUDER AT NIGHT -> ALARM ON!");
  } else {
    digitalWrite(LED_PIN, isDark ? HIGH : LOW);
    noTone(BUZZER_PIN);
    Serial.print("LDR_ADC=");
    Serial.print(lightAdc);
    Serial.print(" Dark=");
    Serial.print(isDark ? "YES" : "NO");
    Serial.print(" Motion=");
    Serial.println(motion ? "YES" : "NO");
  }
  delay(250);
}
`,
    },
  },
];
