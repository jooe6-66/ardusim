import {
  AVRADC,
  AVRClock,
  AVRIOPort,
  AVRSPI,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  clockConfig,
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
} from 'avr8js';
import { Ds3231Rtc, I2CBusRouter, I2CDevice, Lcd1602I2C, Mpu6050Imu, OledSsd1306 } from './devices/i2c-devices.js';
import {
  Max7219Matrix,
  Mfrc522Device,
  NeoPixelStrip,
  SoftUartDevice,
  StepperMotorDevice,
  buildNmeaSentence,
} from './devices/spi-uart-devices.js';
import { BuzzerDevice, ContinuousServoDevice, DhtDevice, HcSr04Device, ServoDevice } from './devices/timing-devices.js';
import { parseIntelHex } from './hex-parser.js';
import {
  megaAdcConfig,
  megaSpiConfig,
  megaTimer0Config,
  megaTimer1Config,
  megaTimer2Config,
  megaTimer3Config,
  megaTimer4Config,
  megaTimer5Config,
  megaTwiConfig,
  megaUsart0Config,
  megaUsart1Config,
  megaUsart2Config,
  megaUsart3Config,
} from './mcu-configs.js';
import { buildNetlist } from './netlist.js';
import { PassiveCircuitSolver } from './passive-solver.js';
import {
  AvrPortName,
  BoardId,
  LcdDisplayState,
  Max7219State,
  McuPinState,
  NetlistResult,
  OledDisplayState,
  PartInstance,
  PartManifest,
  PinModeState,
  Servo360VisualState,
  SimSnapshot,
  StepperVisualState,
  Wire,
  isMcuBoardType,
} from './types.js';

export const UNO_CLOCK_HZ = 16_000_000;

interface PinAccumulator {
  highCycles: number;
  lastCycle: number;
  lastHigh: boolean;
}

export interface AvrSimulationCallbacks {
  board?: BoardId;
  mcuPartId?: string;
  onSerialByte?: (byte: number, port?: number) => void;
}

interface AttachedPeripherals {
  pinCallbacks: Map<string, Array<(state: PinState) => void>>;
  drivenMcuPins: Set<string>;
  servos: Map<string, { dev: ServoDevice; sigKey: string }>;
  servos360: Map<string, { dev: ContinuousServoDevice; sigKey: string }>;
  buzzers: Map<string, { dev: BuzzerDevice; sigKey: string }>;
  ultrasonics: Map<string, { dev: HcSr04Device; trigKey: string; echoKey: string }>;
  dhts: Map<string, { dev: DhtDevice; dataKey: string }>;
  lcds: Map<string, Lcd1602I2C>;
  oleds: Map<string, OledSsd1306>;
  rtcs: Map<string, Ds3231Rtc>;
  imus: Map<string, Mpu6050Imu>;
  max7219s: Map<string, { dev: Max7219Matrix; usesHwSpi: boolean }>;
  neoPixels: Map<string, { dev: NeoPixelStrip; dinKey: string }>;
  steppers: Map<string, StepperMotorDevice>;
  rfids: Map<string, Mfrc522Device>;
  gpsDevices: Map<string, { dev: SoftUartDevice; txKey: string; lastEmitMs: number }>;
  btDevices: Map<string, { dev: SoftUartDevice; txKey: string; rxKey: string }>;
}

/**
 * Multi-board AVR Simulator supporting Arduino Uno (ATmega328P), Arduino Nano (ATmega328P + A6/A7),
 * and Arduino Mega 2560 (ATmega2560: 256KB flash, 11 GPIO ports, 6 timers, 4 UARTs, 16 ADC, I2C, SPI).
 */
export class AvrSimulator {
  readonly board: BoardId;
  readonly mcuPartId?: string;
  readonly cpu: CPU;
  readonly ports = new Map<AvrPortName, AVRIOPort>();
  readonly timers: AVRTimer[] = [];
  readonly usarts: AVRUSART[] = [];
  readonly adc: AVRADC;
  readonly twi: AVRTWI;
  readonly spi: AVRSPI;
  readonly i2cBus: I2CBusRouter;
  readonly clock: AVRClock;

  private readonly solver = new PassiveCircuitSolver();
  private readonly rxQueues: number[][] = [];
  private readonly pinAcc = new Map<string, PinAccumulator>();
  private readonly portPrevStates = new Map<AvrPortName, Uint8Array>();
  private externalSyncHandler?: () => void;

  private parts: PartInstance[] = [];
  private wires: Wire[] = [];
  private manifests: Map<string, PartManifest> = new Map();
  private netlist: NetlistResult = { pinToNet: new Map(), netToPins: new Map() };
  private pressedButtons = new Set<string>();
  private pressedKeypadKeys = new Set<string>();
  private energizedRelays = new Set<string>();
  private running = false;

  private attached: AttachedPeripherals = {
    pinCallbacks: new Map(),
    drivenMcuPins: new Set(),
    servos: new Map(),
    servos360: new Map(),
    buzzers: new Map(),
    ultrasonics: new Map(),
    dhts: new Map(),
    lcds: new Map(),
    oleds: new Map(),
    rtcs: new Map(),
    imus: new Map(),
    max7219s: new Map(),
    neoPixels: new Map(),
    steppers: new Map(),
    rfids: new Map(),
    gpsDevices: new Map(),
    btDevices: new Map(),
  };

  constructor(hex: string, callbacks: AvrSimulationCallbacks = {}) {
    this.board = callbacks.board ?? 'arduino-uno';
    this.mcuPartId = callbacks.mcuPartId;
    const isMega = this.board === 'arduino-mega';

    const progMem = parseIntelHex(hex, isMega ? 262144 : 32768);
    this.cpu = new CPU(progMem, isMega ? 8192 + 0x100 : 2048);

    if (isMega) {
      const megaPorts: Array<[AvrPortName, typeof portAConfig]> = [
        ['A', portAConfig],
        ['B', portBConfig],
        ['C', portCConfig],
        ['D', portDConfig],
        ['E', portEConfig],
        ['F', portFConfig],
        ['G', portGConfig],
        ['H', portHConfig],
        ['J', portJConfig],
        ['K', portKConfig],
        ['L', portLConfig],
      ];
      for (const [name, cfg] of megaPorts) {
        this.ports.set(name, new AVRIOPort(this.cpu, cfg));
      }
      this.timers.push(
        new AVRTimer(this.cpu, megaTimer0Config),
        new AVRTimer(this.cpu, megaTimer1Config),
        new AVRTimer(this.cpu, megaTimer2Config),
        new AVRTimer(this.cpu, megaTimer3Config),
        new AVRTimer(this.cpu, megaTimer4Config),
        new AVRTimer(this.cpu, megaTimer5Config)
      );
      const uConfigs = [megaUsart0Config, megaUsart1Config, megaUsart2Config, megaUsart3Config];
      uConfigs.forEach((cfg, idx) => {
        const u = new AVRUSART(this.cpu, cfg, UNO_CLOCK_HZ);
        u.onByteTransmit = (b) => callbacks.onSerialByte?.(b, idx);
        this.usarts.push(u);
        this.rxQueues.push([]);
      });
      this.adc = new AVRADC(this.cpu, megaAdcConfig);
      this.twi = new AVRTWI(this.cpu, megaTwiConfig, UNO_CLOCK_HZ);
      this.spi = new AVRSPI(this.cpu, megaSpiConfig, UNO_CLOCK_HZ);
    } else {
      this.ports.set('B', new AVRIOPort(this.cpu, portBConfig));
      this.ports.set('C', new AVRIOPort(this.cpu, portCConfig));
      this.ports.set('D', new AVRIOPort(this.cpu, portDConfig));
      this.timers.push(
        new AVRTimer(this.cpu, timer0Config),
        new AVRTimer(this.cpu, timer1Config),
        new AVRTimer(this.cpu, timer2Config)
      );
      const u0 = new AVRUSART(this.cpu, usart0Config, UNO_CLOCK_HZ);
      u0.onByteTransmit = (b) => callbacks.onSerialByte?.(b, 0);
      this.usarts.push(u0);
      this.rxQueues.push([]);
      this.adc = new AVRADC(this.cpu, adcConfig);
      this.twi = new AVRTWI(this.cpu, twiConfig, UNO_CLOCK_HZ);
      this.spi = new AVRSPI(this.cpu, spiConfig, UNO_CLOCK_HZ);
    }

    this.i2cBus = new I2CBusRouter(this.twi);
    this.twi.eventHandler = this.i2cBus;
    this.clock = new AVRClock(this.cpu, UNO_CLOCK_HZ, clockConfig);

    // Hardware SPI router to attached CS-selected slaves (RC522, MAX7219)
    this.spi.onTransfer = (mosi) => {
      let miso = 0x00;
      for (const rfid of this.attached.rfids.values()) {
        if (rfid.isSelected()) {
          miso = rfid.transferByte(mosi);
        }
      }
      for (const entry of this.attached.max7219s.values()) {
        if (entry.usesHwSpi) entry.dev.onSpiByte(mosi);
      }
      return miso;
    };

    for (const [portName, port] of this.ports.entries()) {
      const prevStates = new Uint8Array(8).fill(255);
      this.portPrevStates.set(portName, prevStates);
      for (let bit = 0; bit < 8; bit++) {
        this.pinAcc.set(`${portName}:${bit}`, {
          highCycles: 0,
          lastCycle: 0,
          lastHigh: false,
        });
      }

      port.addListener(() => {
        const now = this.cpu.cycles;
        let pullupChanged = false;
        for (let bit = 0; bit < 8; bit++) {
          const pKey = `${portName}:${bit}`;
          const acc = this.pinAcc.get(pKey)!;
          const st = port.pinState(bit);
          if (acc.lastHigh) {
            acc.highCycles += now - acc.lastCycle;
          }
          acc.lastCycle = now;
          acc.lastHigh = st === PinState.High;

          if (st !== prevStates[bit]) {
            prevStates[bit] = st;
            if (st === PinState.InputPullUp) pullupChanged = true;
            const cbs = this.attached.pinCallbacks.get(pKey);
            if (cbs) {
              for (const cb of cbs) cb(st);
            }
          }
        }
        if (pullupChanged && this.parts.length > 0) {
          if (this.externalSyncHandler) this.externalSyncHandler();
          else this.syncExternalInputs();
        }
      });
    }
  }

  get usart(): AVRUSART {
    return this.usarts[0];
  }

  setCircuit(
    parts: PartInstance[],
    wires: Wire[],
    manifests: Map<string, PartManifest>,
    pressedButtons: Set<string> = new Set(),
    pressedKeypadKeys: Set<string> = new Set()
  ): void {
    this.parts = parts;
    this.wires = wires;
    this.manifests = manifests;
    this.pressedButtons = new Set(pressedButtons);
    this.pressedKeypadKeys = new Set(pressedKeypadKeys);
    this.netlist = buildNetlist(parts, wires, manifests, {
      pressedButtons: this.pressedButtons,
      pressedKeypadKeys: this.pressedKeypadKeys,
      energizedRelays: this.energizedRelays,
    });
    this.bindSmartPeripherals();
    this.syncExternalInputs();
  }

  sendBluetoothMessage(partId: string, text: string): void {
    const entry = this.attached.btDevices.get(partId);
    if (entry) {
      entry.dev.enqueueText(text);
    }
  }

  clearBluetoothLog(partId: string): void {
    this.attached.btDevices.get(partId)?.dev.clearReceivedLog();
  }

  private getMcuPart(): PartInstance | undefined {
    if (this.mcuPartId) {
      return this.parts.find((p) => p.id === this.mcuPartId && isMcuBoardType(p.type));
    }
    return this.parts.find((p) => isMcuBoardType(p.type));
  }

  /** Used by MultiMcuSimulator to bind this CPU onto a shared multi-board netlist. */
  attachSharedCircuit(
    parts: PartInstance[],
    wires: Wire[],
    manifests: Map<string, PartManifest>,
    netlist: NetlistResult,
    pressedButtons: Set<string>,
    pressedKeypadKeys: Set<string>,
    energizedRelays: Set<string>,
    externalSyncHandler?: () => void
  ): void {
    this.parts = parts;
    this.wires = wires;
    this.manifests = manifests;
    this.netlist = netlist;
    this.pressedButtons = pressedButtons;
    this.pressedKeypadKeys = pressedKeypadKeys;
    this.energizedRelays = energizedRelays;
    this.externalSyncHandler = externalSyncHandler;
    this.bindSmartPeripherals();
  }

  updateSharedNetlist(netlist: NetlistResult): void {
    this.netlist = netlist;
  }

  private findConnectedMcuPin(
    partId: string,
    pinId: string
  ): { mcuPartId: string; pinId: string; avrPort: AvrPortName; avrBit: number } | null {
    const net = this.netlist.pinToNet.get(`${partId}:${pinId}`);
    if (!net) return null;
    const mcuPart = this.getMcuPart();
    const mcuManifest = mcuPart ? this.manifests.get(mcuPart.type) : undefined;
    if (!mcuPart || !mcuManifest) return null;

    for (const pin of mcuManifest.pins) {
      if (!pin.avrPort || pin.avrBit === undefined) continue;
      if (this.netlist.pinToNet.get(`${mcuPart.id}:${pin.id}`) === net) {
        return { mcuPartId: mcuPart.id, pinId: pin.id, avrPort: pin.avrPort, avrBit: pin.avrBit };
      }
    }
    return null;
  }

  /** Preserves live device state across slider/prop updates while rebinding changed wires cleanly. */
  private bindSmartPeripherals(): void {
    const prev = this.attached;
    const pinCallbacks = new Map<string, Array<(state: PinState) => void>>();
    const drivenMcuPins = new Set<string>();
    const servos = new Map<string, { dev: ServoDevice; sigKey: string }>();
    const servos360 = new Map<string, { dev: ContinuousServoDevice; sigKey: string }>();
    const buzzers = new Map<string, { dev: BuzzerDevice; sigKey: string }>();
    const ultrasonics = new Map<string, { dev: HcSr04Device; trigKey: string; echoKey: string }>();
    const dhts = new Map<string, { dev: DhtDevice; dataKey: string }>();
    const lcds = new Map<string, Lcd1602I2C>();
    const oleds = new Map<string, OledSsd1306>();
    const rtcs = new Map<string, Ds3231Rtc>();
    const imus = new Map<string, Mpu6050Imu>();
    const max7219s = new Map<string, { dev: Max7219Matrix; usesHwSpi: boolean }>();
    const neoPixels = new Map<string, { dev: NeoPixelStrip; dinKey: string }>();
    const steppers = new Map<string, StepperMotorDevice>();
    const rfids = new Map<string, Mfrc522Device>();
    const gpsDevices = new Map<string, { dev: SoftUartDevice; txKey: string; lastEmitMs: number }>();
    const btDevices = new Map<string, { dev: SoftUartDevice; txKey: string; rxKey: string }>();
    const nextI2cDevices: I2CDevice[] = [];
    const finite = (v: unknown, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };

    const addPinCb = (port: AvrPortName, bit: number, cb: (state: PinState) => void) => {
      const k = `${port}:${bit}`;
      let list = pinCallbacks.get(k);
      if (!list) {
        list = [];
        pinCallbacks.set(k, list);
      }
      list.push(cb);
    };

    const mcuPart = this.getMcuPart();
    const sdaPinId = mcuPart?.type === 'arduino-mega' ? '20' : 'A4';
    const sclPinId = mcuPart?.type === 'arduino-mega' ? '21' : 'A5';
    const hwMosiKey = this.board === 'arduino-mega' ? 'B:2' : 'B:3';
    const hwSckKey = this.board === 'arduino-mega' ? 'B:1' : 'B:5';
    const mcuSdaNet = mcuPart ? this.netlist.pinToNet.get(`${mcuPart.id}:${sdaPinId}`) : undefined;
    const mcuSclNet = mcuPart ? this.netlist.pinToNet.get(`${mcuPart.id}:${sclPinId}`) : undefined;

    const isI2cWired = (partId: string) =>
      mcuSdaNet !== undefined &&
      mcuSclNet !== undefined &&
      this.netlist.pinToNet.get(`${partId}:SDA`) === mcuSdaNet &&
      this.netlist.pinToNet.get(`${partId}:SCL`) === mcuSclNet;

    for (const part of this.parts) {
      if (part.type === 'hc-sr04') {
        const trig = this.findConnectedMcuPin(part.id, 'TRIG');
        const echo = this.findConnectedMcuPin(part.id, 'ECHO');
        if (trig && echo) {
          const echoPort = this.ports.get(echo.avrPort);
          if (echoPort) {
            const trigKey = `${trig.avrPort}:${trig.avrBit}`;
            const echoKey = `${echo.avrPort}:${echo.avrBit}`;
            drivenMcuPins.add(`${echo.mcuPartId}:${echo.pinId}`);
            const old = prev.ultrasonics.get(part.id);
            const dev =
              old && old.trigKey === trigKey && old.echoKey === echoKey
                ? old.dev
                : new HcSr04Device(this.cpu, UNO_CLOCK_HZ, (high) => echoPort.setPin(echo.avrBit, high));
            dev.distanceCm = finite(part.props.distanceCm, 45);
            if (!old || old.echoKey !== echoKey) echoPort.setPin(echo.avrBit, false);
            addPinCb(trig.avrPort, trig.avrBit, (st) => dev.onTrigChange(st === PinState.High));
            ultrasonics.set(part.id, { dev, trigKey, echoKey });
          }
        }
      } else if (part.type === 'dht22') {
        const data = this.findConnectedMcuPin(part.id, 'DATA');
        if (data) {
          const dataPort = this.ports.get(data.avrPort);
          if (dataPort) {
            const dataKey = `${data.avrPort}:${data.avrBit}`;
            drivenMcuPins.add(`${data.mcuPartId}:${data.pinId}`);
            const old = prev.dhts.get(part.id);
            const dev =
              old && old.dataKey === dataKey
                ? old.dev
                : new DhtDevice(this.cpu, UNO_CLOCK_HZ, (high) => dataPort.setPin(data.avrBit, high));
            dev.temperatureC = finite(part.props.tempC, 27.5);
            dev.humidityPct = finite(part.props.humidityPct, 60);
            dev.model = part.props.model === 'DHT11' ? 'DHT11' : 'DHT22';
            if (!old || old.dataKey !== dataKey) dataPort.setPin(data.avrBit, true);
            addPinCb(data.avrPort, data.avrBit, (st) => dev.onLineChange(st === PinState.Low));
            dhts.set(part.id, { dev, dataKey });
          }
        }
      } else if (part.type === 'servo') {
        const sig = this.findConnectedMcuPin(part.id, 'SIG');
        if (sig) {
          const sigKey = `${sig.avrPort}:${sig.avrBit}`;
          const old = prev.servos.get(part.id);
          const dev = old && old.sigKey === sigKey ? old.dev : new ServoDevice(this.cpu, UNO_CLOCK_HZ);
          addPinCb(sig.avrPort, sig.avrBit, (st) => dev.onSignalChange(st === PinState.High));
          servos.set(part.id, { dev, sigKey });
        }
      } else if (part.type === 'servo-360') {
        const sig = this.findConnectedMcuPin(part.id, 'SIG');
        if (sig) {
          const sigKey = `${sig.avrPort}:${sig.avrBit}`;
          const maxRpm = finite(part.props.maxRpm, 120);
          const old = prev.servos360.get(part.id);
          const dev =
            old && old.sigKey === sigKey
              ? old.dev
              : new ContinuousServoDevice(this.cpu, UNO_CLOCK_HZ, maxRpm);
          dev.maxRpm = maxRpm;
          addPinCb(sig.avrPort, sig.avrBit, (st) => dev.onSignalChange(st === PinState.High));
          servos360.set(part.id, { dev, sigKey });
        }
      } else if (part.type === 'buzzer') {
        const pos = this.findConnectedMcuPin(part.id, '+');
        if (pos) {
          const sigKey = `${pos.avrPort}:${pos.avrBit}`;
          const old = prev.buzzers.get(part.id);
          const dev = old && old.sigKey === sigKey ? old.dev : new BuzzerDevice(this.cpu, UNO_CLOCK_HZ);
          addPinCb(pos.avrPort, pos.avrBit, (st) => dev.onSignalChange(st === PinState.High));
          buzzers.set(part.id, { dev, sigKey });
        }
      } else if (part.type === 'lcd-1602-i2c') {
        const addr = finite(part.props.i2cAddress, 0x27);
        const existing = prev.lcds.get(part.id);
        const lcd = existing && existing.address === addr ? existing : new Lcd1602I2C(addr);
        lcds.set(part.id, lcd);
        if (isI2cWired(part.id)) nextI2cDevices.push(lcd);
      } else if (part.type === 'oled-ssd1306') {
        const addr = finite(part.props.i2cAddress, 0x3c);
        const existing = prev.oleds.get(part.id);
        const oled = existing && existing.address === addr ? existing : new OledSsd1306(addr);
        oleds.set(part.id, oled);
        if (isI2cWired(part.id)) nextI2cDevices.push(oled);
      } else if (part.type === 'ds3231-rtc') {
        const rtc = prev.rtcs.get(part.id) ?? new Ds3231Rtc();
        rtcs.set(part.id, rtc);
        if (isI2cWired(part.id)) nextI2cDevices.push(rtc);
      } else if (part.type === 'mpu6050') {
        const addr = finite(part.props.i2cAddress, 0x68);
        const existing = prev.imus.get(part.id);
        const imu = existing && existing.address === addr ? existing : new Mpu6050Imu(addr);
        imu.pitchDeg = finite(part.props.pitchDeg, 0);
        imu.rollDeg = finite(part.props.rollDeg, 0);
        imu.tempC = finite(part.props.tempC, 25);
        imus.set(part.id, imu);
        if (isI2cWired(part.id)) nextI2cDevices.push(imu);
      } else if (part.type === 'max7219') {
        const din = this.findConnectedMcuPin(part.id, 'DIN');
        const clk = this.findConnectedMcuPin(part.id, 'CLK');
        const cs = this.findConnectedMcuPin(part.id, 'CS');
        const usesHwSpi =
          din !== null &&
          clk !== null &&
          `${din.avrPort}:${din.avrBit}` === hwMosiKey &&
          `${clk.avrPort}:${clk.avrBit}` === hwSckKey;
        const dev = prev.max7219s.get(part.id)?.dev ?? new Max7219Matrix();
        if (din) addPinCb(din.avrPort, din.avrBit, (st) => dev.onDinChange(st === PinState.High));
        if (clk) addPinCb(clk.avrPort, clk.avrBit, (st) => dev.onClkChange(st === PinState.High));
        if (cs) addPinCb(cs.avrPort, cs.avrBit, (st) => dev.onCsChange(st === PinState.High));
        max7219s.set(part.id, { dev, usesHwSpi });
      } else if (part.type === 'neopixel-strip') {
        const din = this.findConnectedMcuPin(part.id, 'DIN');
        if (din) {
          const dinKey = `${din.avrPort}:${din.avrBit}`;
          const old = prev.neoPixels.get(part.id);
          const dev = old && old.dinKey === dinKey ? old.dev : new NeoPixelStrip(this.cpu, UNO_CLOCK_HZ, 8);
          addPinCb(din.avrPort, din.avrBit, (st) => dev.onSignalChange(st === PinState.High));
          neoPixels.set(part.id, { dev, dinKey });
        }
      } else if (part.type === 'stepper') {
        const dev = prev.steppers.get(part.id) ?? new StepperMotorDevice();
        dev.stepsPerRev = finite(part.props.stepsPerRev, 200);
        const coilPins: Array<['IN1' | 'IN2' | 'IN3' | 'IN4', 0 | 1 | 2 | 3]> = [
          ['IN1', 0],
          ['IN2', 1],
          ['IN3', 2],
          ['IN4', 3],
        ];
        for (const [pinName, idx] of coilPins) {
          const p = this.findConnectedMcuPin(part.id, pinName);
          if (p) addPinCb(p.avrPort, p.avrBit, (st) => dev.onCoilChange(idx, st === PinState.High));
        }
        steppers.set(part.id, dev);
      } else if (part.type === 'rfid-rc522') {
        const cs = this.findConnectedMcuPin(part.id, 'SDA');
        const rst = this.findConnectedMcuPin(part.id, 'RST');
        const rfid = prev.rfids.get(part.id) ?? new Mfrc522Device();
        rfid.cardPresent = Boolean(part.props.cardPresent);
        if (typeof part.props.uid === 'string') rfid.setUidHex(part.props.uid);
        if (cs) {
          const csPort = this.ports.get(cs.avrPort);
          if (csPort) rfid.onCsChange(csPort.pinState(cs.avrBit) === PinState.High);
          addPinCb(cs.avrPort, cs.avrBit, (st) => rfid.onCsChange(st === PinState.High));
        }
        if (rst) {
          addPinCb(rst.avrPort, rst.avrBit, (st) => {
            if (st === PinState.Low) rfid.softReset();
          });
        }
        rfids.set(part.id, rfid);
      } else if (part.type === 'gps-neo6m') {
        const tx = this.findConnectedMcuPin(part.id, 'TX');
        if (tx) {
          const txPort = this.ports.get(tx.avrPort);
          if (txPort) {
            const txKey = `${tx.avrPort}:${tx.avrBit}`;
            drivenMcuPins.add(`${tx.mcuPartId}:${tx.pinId}`);
            const old = prev.gpsDevices.get(part.id);
            const dev =
              old && old.txKey === txKey
                ? old.dev
                : new SoftUartDevice(this.cpu, UNO_CLOCK_HZ, (h) => txPort.setPin(tx.avrBit, h), null, 9600);
            gpsDevices.set(part.id, { dev, txKey, lastEmitMs: old?.lastEmitMs ?? -950 });
          }
        }
      } else if (part.type === 'hc-05') {
        const tx = this.findConnectedMcuPin(part.id, 'TXD');
        const rx = this.findConnectedMcuPin(part.id, 'RXD');
        const txKey = tx ? `${tx.avrPort}:${tx.avrBit}` : '';
        const rxKey = rx ? `${rx.avrPort}:${rx.avrBit}` : '';
        const txPort = tx ? this.ports.get(tx.avrPort) : undefined;
        const rxPort = rx ? this.ports.get(rx.avrPort) : undefined;
        if (tx && txPort) drivenMcuPins.add(`${tx.mcuPartId}:${tx.pinId}`);
        const old = prev.btDevices.get(part.id);
        const dev =
          old && old.txKey === txKey && old.rxKey === rxKey
            ? old.dev
            : new SoftUartDevice(
                this.cpu,
                UNO_CLOCK_HZ,
                tx && txPort ? (h) => txPort.setPin(tx.avrBit, h) : null,
                rx && rxPort ? () => rxPort.pinState(rx.avrBit) === PinState.High : null,
                9600
              );
        if (rx && rxPort) {
          addPinCb(rx.avrPort, rx.avrBit, (st) => dev.onRxPinChange(st === PinState.High));
        }
        btDevices.set(part.id, { dev, txKey, rxKey });
      }
    }

    this.i2cBus.syncDevices(nextI2cDevices);

    // Dispose removed or replaced clock-event peripherals so stale timers stop firing
    for (const [id, old] of prev.ultrasonics) {
      if (ultrasonics.get(id)?.dev !== old.dev) old.dev.dispose();
    }
    for (const [id, old] of prev.dhts) {
      if (dhts.get(id)?.dev !== old.dev) old.dev.dispose();
    }
    for (const [id, old] of prev.gpsDevices) {
      if (gpsDevices.get(id)?.dev !== old.dev) old.dev.dispose();
    }
    for (const [id, old] of prev.btDevices) {
      if (btDevices.get(id)?.dev !== old.dev) old.dev.dispose();
    }

    this.attached = {
      pinCallbacks,
      drivenMcuPins,
      servos,
      servos360,
      buzzers,
      ultrasonics,
      dhts,
      lcds,
      oleds,
      rtcs,
      imus,
      max7219s,
      neoPixels,
      steppers,
      rfids,
      gpsDevices,
      btDevices,
    };
  }

  queueSerialInput(text: string, portIndex = 0): void {
    const q = this.rxQueues[portIndex] ?? this.rxQueues[0];
    if (!q) return;
    for (let i = 0; i < text.length; i++) {
      q.push(text.charCodeAt(i) & 0xff);
    }
  }

  queueSerialByte(byte: number, portIndex = 0): void {
    const q = this.rxQueues[portIndex];
    if (q) q.push(byte & 0xff);
  }

  reset(): void {
    for (const old of this.attached.ultrasonics.values()) old.dev.dispose();
    for (const old of this.attached.dhts.values()) old.dev.dispose();
    for (const old of this.attached.gpsDevices.values()) old.dev.dispose();
    for (const old of this.attached.btDevices.values()) old.dev.dispose();
    this.attached = {
      pinCallbacks: new Map(),
      drivenMcuPins: new Set(),
      servos: new Map(),
      servos360: new Map(),
      buzzers: new Map(),
      ultrasonics: new Map(),
      dhts: new Map(),
      lcds: new Map(),
      oleds: new Map(),
      rtcs: new Map(),
      imus: new Map(),
      max7219s: new Map(),
      neoPixels: new Map(),
      steppers: new Map(),
      rfids: new Map(),
      gpsDevices: new Map(),
      btDevices: new Map(),
    };
    this.i2cBus.clear();
    for (const prevStates of this.portPrevStates.values()) {
      prevStates.fill(255);
    }

    this.cpu.reset();
    for (const u of this.usarts) u.reset();
    this.spi.reset();
    this.solver.reset();
    for (const q of this.rxQueues) q.length = 0;
    this.energizedRelays.clear();
    for (const acc of this.pinAcc.values()) {
      acc.highCycles = 0;
      acc.lastCycle = 0;
      acc.lastHigh = false;
    }

    if (this.parts.length > 0) {
      this.netlist = buildNetlist(this.parts, this.wires, this.manifests, {
        pressedButtons: this.pressedButtons,
        pressedKeypadKeys: this.pressedKeypadKeys,
        energizedRelays: this.energizedRelays,
      });
      this.bindSmartPeripherals();
      this.syncExternalInputs();
    }
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  collectMcuPins(dutyByPortBit?: Map<string, number>): McuPinState[] {
    const mcuPins: McuPinState[] = [];
    const mcuPart = this.getMcuPart();
    const mcuManifest = mcuPart ? this.manifests.get(mcuPart.type) : undefined;
    if (!mcuPart || !mcuManifest) return mcuPins;

    for (const pin of mcuManifest.pins) {
      if (!pin.avrPort || pin.avrBit === undefined) continue;
      const port = this.ports.get(pin.avrPort);
      if (!port) continue;
      const st = port.pinState(pin.avrBit);
      const duty = dutyByPortBit
        ? (dutyByPortBit.get(`${pin.avrPort}:${pin.avrBit}`) ?? 0)
        : st === PinState.High
          ? 1
          : 0;

      let mode: PinModeState;
      let outputVoltage = 0;
      if (st === PinState.Input) {
        mode = 'INPUT';
      } else if (st === PinState.InputPullUp) {
        mode = 'INPUT_PULLUP';
        outputVoltage = 5.0;
      } else {
        outputVoltage = duty * 5.0;
        mode = outputVoltage >= 2.5 ? 'OUTPUT_HIGH' : 'OUTPUT_LOW';
      }

      mcuPins.push({
        pinKey: `${mcuPart.id}:${pin.id}`,
        mode,
        outputVoltage,
      });
    }
    return mcuPins;
  }

  applyBoardVoltages(netVoltages: Map<string, number>, pinVoltages: Record<string, number>): void {
    const mcuPart = this.getMcuPart();
    const mcuManifest = mcuPart ? this.manifests.get(mcuPart.type) : undefined;
    if (!mcuPart || !mcuManifest) return;

    for (const pin of mcuManifest.pins) {
      const key = `${mcuPart.id}:${pin.id}`;
      const net = this.netlist.pinToNet.get(key);
      const volts = net !== undefined ? (netVoltages.get(net) ?? 0) : 0;
      pinVoltages[key] = volts;

      if (pin.avrPort && pin.avrBit !== undefined && !this.attached.drivenMcuPins.has(key)) {
        const port = this.ports.get(pin.avrPort);
        if (port) {
          const st = port.pinState(pin.avrBit);
          if (st === PinState.Input || st === PinState.InputPullUp) {
            port.setPin(pin.avrBit, volts >= 2.5);
          }
        }
      }
      if (pin.adcChannel !== undefined) {
        this.adc.channelValues[pin.adcChannel] = Math.min(5, Math.max(0, volts));
      }
    }
  }

  private applySolvedInputs(netVoltages: Map<string, number>): Record<string, number> {
    const pinVoltages: Record<string, number> = {};
    this.applyBoardVoltages(netVoltages, pinVoltages);

    for (const part of this.parts) {
      const manifest = this.manifests.get(part.type);
      if (!manifest || part.type === 'breadboard-half') continue;
      for (const pin of manifest.pins) {
        const key = `${part.id}:${pin.id}`;
        const net = this.netlist.pinToNet.get(key);
        if (net !== undefined) {
          const v = netVoltages.get(net);
          if (v !== undefined) pinVoltages[key] = v;
        }
      }
    }
    return pinVoltages;
  }

  /** Read-only solve for immediate INPUT_PULLUP / ADC sync without advancing capacitor charge. */
  private syncExternalInputs(): void {
    if (this.parts.length === 0) return;
    const mcuPins = this.collectMcuPins();
    const solved = this.solver.solve(this.parts, this.manifests, this.netlist, mcuPins, 0.01, false);
    this.applySolvedInputs(solved.netVoltages);
  }

  /** Steps this CPU core for `cyclesToRun` cycles and returns accumulated per-pin PWM duty ratios. */
  stepCpuSlice(cyclesToRun: number): { elapsedCycles: number; dutyByPortBit: Map<string, number> } {
    const startCycle = this.cpu.cycles;
    const targetCycle = startCycle + cyclesToRun;

    const currentTimeMs = Math.round((startCycle / UNO_CLOCK_HZ) * 1000);
    for (const rtc of this.attached.rtcs.values()) {
      rtc.setSimElapsedMs(currentTimeMs);
    }

    // Emit periodic 1 Hz NMEA-0183 sentences from connected GPS NEO-6M modules
    for (const [partId, entry] of this.attached.gpsDevices.entries()) {
      if (currentTimeMs - entry.lastEmitMs >= 1000) {
        const part = this.parts.find((p) => p.id === partId);
        const rawLat = Number(part?.props.lat);
        const rawLon = Number(part?.props.lon);
        const rawSpeed = Number(part?.props.speedKnots);
        const lat = Number.isFinite(rawLat) ? rawLat : -6.2088;
        const lon = Number.isFinite(rawLon) ? rawLon : 106.8456;
        const speed = Number.isFinite(rawSpeed) ? rawSpeed : 1.5;
        entry.dev.enqueueText(buildNmeaSentence(lat, lon, speed));
        entry.lastEmitMs = currentTimeMs;
      }
    }

    for (const [key, acc] of this.pinAcc.entries()) {
      const [pName, bStr] = key.split(':') as [AvrPortName, string];
      const port = this.ports.get(pName);
      if (!port) continue;
      const state = port.pinState(Number(bStr));
      acc.highCycles = 0;
      acc.lastCycle = startCycle;
      acc.lastHigh = state === PinState.High;
    }

    while (this.cpu.cycles < targetCycle) {
      for (let uIdx = 0; uIdx < this.usarts.length; uIdx++) {
        const q = this.rxQueues[uIdx];
        if (q && q.length > 0 && !this.usarts[uIdx].rxBusy) {
          this.usarts[uIdx].writeByte(q.shift()!);
        }
      }
      avrInstruction(this.cpu);
      this.cpu.tick();
    }

    const endCycle = this.cpu.cycles;
    const elapsedCycles = Math.max(1, endCycle - startCycle);
    const dutyByPortBit = new Map<string, number>();
    for (const [key, acc] of this.pinAcc.entries()) {
      if (acc.lastHigh) {
        acc.highCycles += endCycle - acc.lastCycle;
      }
      acc.lastCycle = endCycle;
      dutyByPortBit.set(key, Math.min(1, Math.max(0, acc.highCycles / elapsedCycles)));
    }
    return { elapsedCycles, dutyByPortBit };
  }

  collectAttachedSnapshot(dutyByPortBit: Map<string, number>) {
    const servoAngles: Record<string, number> = {};
    for (const [id, entry] of this.attached.servos.entries()) servoAngles[id] = entry.dev.angleDeg;

    const servo360States: Record<string, Servo360VisualState> = {};
    for (const [id, entry] of this.attached.servos360.entries()) {
      const st = entry.dev.getState();
      servo360States[id] = st;
      servoAngles[id] = Math.round(st.angleDeg);
    }

    const buzzerHz: Record<string, number> = {};
    for (const [id, entry] of this.attached.buzzers.entries()) buzzerHz[id] = entry.dev.sampleAndReset();

    const lcdDisplays: Record<string, LcdDisplayState> = {};
    for (const [id, dev] of this.attached.lcds.entries()) lcdDisplays[id] = dev.getState();

    const oledDisplays: Record<string, OledDisplayState> = {};
    for (const [id, dev] of this.attached.oleds.entries()) oledDisplays[id] = dev.getState();

    const max7219Displays: Record<string, Max7219State> = {};
    for (const [id, entry] of this.attached.max7219s.entries()) max7219Displays[id] = entry.dev.getState();

    const neoPixelStrips: Record<string, Array<[number, number, number]>> = {};
    for (const [id, entry] of this.attached.neoPixels.entries()) {
      neoPixelStrips[id] = entry.dev.getPixels();
    }

    const stepperStates: Record<string, StepperVisualState> = {};
    for (const [id, dev] of this.attached.steppers.entries()) stepperStates[id] = dev.getState();

    const rtcTimes: Record<string, string> = {};
    for (const [id, dev] of this.attached.rtcs.entries()) rtcTimes[id] = dev.getFormattedTime();

    const bluetoothLogs: Record<string, string> = {};
    for (const [id, entry] of this.attached.btDevices.entries()) {
      bluetoothLogs[id] = entry.dev.getReceivedLog();
    }

    const ledKey = this.board === 'arduino-mega' ? 'B:7' : 'B:5';
    const onboardLed = (dutyByPortBit.get(ledKey) ?? 0) > 0.1;

    return {
      onboardLed,
      servoAngles,
      servo360States,
      buzzerHz,
      lcdDisplays,
      oledDisplays,
      max7219Displays,
      neoPixelStrips,
      stepperStates,
      rtcTimes,
      bluetoothLogs,
    };
  }

  stepCycles(cyclesToRun: number): SimSnapshot {
    const { elapsedCycles, dutyByPortBit } = this.stepCpuSlice(cyclesToRun);
    const dtSeconds = elapsedCycles / UNO_CLOCK_HZ;

    const mcuPins = this.collectMcuPins(dutyByPortBit);
    let solved = this.solver.solve(this.parts, this.manifests, this.netlist, mcuPins, dtSeconds, true);

    let relayChanged = false;
    for (const [id, energized] of Object.entries(solved.relayEnergized)) {
      if (energized !== this.energizedRelays.has(id)) {
        relayChanged = true;
        if (energized) this.energizedRelays.add(id);
        else this.energizedRelays.delete(id);
      }
    }
    if (relayChanged) {
      this.netlist = buildNetlist(this.parts, this.wires, this.manifests, {
        pressedButtons: this.pressedButtons,
        pressedKeypadKeys: this.pressedKeypadKeys,
        energizedRelays: this.energizedRelays,
      });
      solved = this.solver.solve(this.parts, this.manifests, this.netlist, mcuPins, dtSeconds, false);
    }

    const pinVoltages = this.applySolvedInputs(solved.netVoltages);
    const attached = this.collectAttachedSnapshot(dutyByPortBit);
    const mcuPart = this.getMcuPart();

    return {
      running: this.running,
      timeMs: Math.round((this.cpu.cycles / UNO_CLOCK_HZ) * 1000),
      onboardLed: attached.onboardLed,
      onboardLeds: mcuPart ? { [mcuPart.id]: attached.onboardLed } : undefined,
      ledStates: solved.ledStates,
      rgbLedStates: solved.rgbLedStates,
      sevenSegStates: solved.sevenSegStates,
      capacitorVoltages: solved.capacitorVoltages,
      diodeConducting: solved.diodeConducting,
      servoAngles: attached.servoAngles,
      servo360States: attached.servo360States,
      buzzerHz: attached.buzzerHz,
      relayEnergized: solved.relayEnergized,
      motorStates: solved.motorStates,
      converterStates: solved.converterStates,
      l298nStates: solved.l298nStates,
      stepperStates: attached.stepperStates,
      lcdDisplays: attached.lcdDisplays,
      oledDisplays: attached.oledDisplays,
      max7219Displays: attached.max7219Displays,
      neoPixelStrips: attached.neoPixelStrips,
      rtcTimes: attached.rtcTimes,
      bluetoothLogs: attached.bluetoothLogs,
      pinVoltages,
      warnings: solved.warnings,
    };
  }
}

export interface MultiMcuBoardSpec {
  partId: string;
  board: BoardId;
  hex: string;
}

const UART_PORT_PINS: Record<BoardId, Array<{ tx: string; rx: string }>> = {
  'arduino-uno': [{ tx: '1', rx: '0' }],
  'arduino-nano': [{ tx: '1', rx: '0' }],
  'arduino-mega': [
    { tx: '1', rx: '0' },
    { tx: '18', rx: '19' },
    { tx: '16', rx: '17' },
    { tx: '14', rx: '15' },
  ],
};

/**
 * Runs 2+ AVR MCU boards in lockstep over a single shared electrical netlist and nodal solver.
 * Bridges cross-board GPIO (digital/analog/PWM), power rails, and hardware UART TX -> RX links.
 */
export class MultiMcuSimulator {
  private readonly sims = new Map<string, AvrSimulator>();
  private readonly solver = new PassiveCircuitSolver();
  private readonly uartRoutes = new Map<string, Array<{ targetId: string; targetPort: number }>>();
  private parts: PartInstance[] = [];
  private wires: Wire[] = [];
  private manifests: Map<string, PartManifest> = new Map();
  private netlist: NetlistResult = { pinToNet: new Map(), netToPins: new Map() };
  private pressedButtons = new Set<string>();
  private pressedKeypadKeys = new Set<string>();
  private energizedRelays = new Set<string>();
  private running = false;

  constructor(
    specs: MultiMcuBoardSpec[],
    callbacks: { onSerialByte?: (mcuPartId: string, byte: number, port?: number) => void } = {}
  ) {
    for (const spec of specs) {
      const sim = new AvrSimulator(spec.hex, {
        board: spec.board,
        mcuPartId: spec.partId,
        onSerialByte: (byte, port = 0) => {
          callbacks.onSerialByte?.(spec.partId, byte, port);
          const links = this.uartRoutes.get(`${spec.partId}:${port}`);
          if (links) {
            for (const link of links) {
              this.sims.get(link.targetId)?.queueSerialByte(byte, link.targetPort);
            }
          }
        },
      });
      this.sims.set(spec.partId, sim);
    }
  }

  setRunning(running: boolean): void {
    this.running = running;
    for (const sim of this.sims.values()) sim.setRunning(running);
  }

  queueSerialInput(mcuPartId: string, text: string): void {
    this.sims.get(mcuPartId)?.queueSerialInput(text);
  }

  sendBluetoothMessage(partId: string, text: string): void {
    for (const sim of this.sims.values()) sim.sendBluetoothMessage(partId, text);
  }

  clearBluetoothLog(partId: string): void {
    for (const sim of this.sims.values()) sim.clearBluetoothLog(partId);
  }

  setCircuit(
    parts: PartInstance[],
    wires: Wire[],
    manifests: Map<string, PartManifest>,
    pressedButtons: Set<string> = new Set(),
    pressedKeypadKeys: Set<string> = new Set()
  ): void {
    this.parts = parts;
    this.wires = wires;
    this.manifests = manifests;
    this.pressedButtons = new Set(pressedButtons);
    this.pressedKeypadKeys = new Set(pressedKeypadKeys);
    this.netlist = buildNetlist(parts, wires, manifests, {
      pressedButtons: this.pressedButtons,
      pressedKeypadKeys: this.pressedKeypadKeys,
      energizedRelays: this.energizedRelays,
    });
    this.rebuildUartRoutes();
    const syncAll = () => this.syncSharedInputs();
    for (const sim of this.sims.values()) {
      sim.attachSharedCircuit(
        this.parts,
        this.wires,
        this.manifests,
        this.netlist,
        this.pressedButtons,
        this.pressedKeypadKeys,
        this.energizedRelays,
        syncAll
      );
    }
    this.syncSharedInputs();
  }

  private rebuildUartRoutes(): void {
    this.uartRoutes.clear();
    const rxByNet = new Map<string, Array<{ partId: string; portIdx: number }>>();
    for (const [partId, sim] of this.sims.entries()) {
      const ports = UART_PORT_PINS[sim.board];
      ports.forEach((p, idx) => {
        const net = this.netlist.pinToNet.get(`${partId}:${p.rx}`);
        if (!net) return;
        const list = rxByNet.get(net) ?? [];
        list.push({ partId, portIdx: idx });
        rxByNet.set(net, list);
      });
    }
    for (const [partId, sim] of this.sims.entries()) {
      const ports = UART_PORT_PINS[sim.board];
      ports.forEach((p, idx) => {
        const net = this.netlist.pinToNet.get(`${partId}:${p.tx}`);
        if (!net) return;
        const receivers = (rxByNet.get(net) ?? []).filter((r) => r.partId !== partId);
        if (receivers.length > 0) {
          this.uartRoutes.set(
            `${partId}:${idx}`,
            receivers.map((r) => ({ targetId: r.partId, targetPort: r.portIdx }))
          );
        }
      });
    }
  }

  private syncSharedInputs(): void {
    if (this.parts.length === 0) return;
    const allMcuPins: McuPinState[] = [];
    for (const sim of this.sims.values()) {
      allMcuPins.push(...sim.collectMcuPins());
    }
    const solved = this.solver.solve(this.parts, this.manifests, this.netlist, allMcuPins, 0.01, false);
    const pinVoltages: Record<string, number> = {};
    for (const sim of this.sims.values()) {
      sim.applyBoardVoltages(solved.netVoltages, pinVoltages);
    }
  }

  stepCycles(cyclesToRun: number): SimSnapshot {
    // Interleave small slices (~65k cycles ~= 4ms) so cross-board digital/analog signals propagate cleanly
    const sliceCount = Math.max(1, Math.min(8, Math.ceil(cyclesToRun / 65_000)));
    const sliceCycles = Math.max(1, Math.round(cyclesToRun / sliceCount));

    const dutyAccum = new Map<string, Map<string, number>>();
    for (const id of this.sims.keys()) dutyAccum.set(id, new Map());

    let lastSolved = this.solver.solve(this.parts, this.manifests, this.netlist, [], 1e-6, false);

    for (let s = 0; s < sliceCount; s++) {
      const allMcuPins: McuPinState[] = [];
      let sliceElapsed = sliceCycles;
      for (const [id, sim] of this.sims.entries()) {
        const { elapsedCycles, dutyByPortBit } = sim.stepCpuSlice(sliceCycles);
        sliceElapsed = elapsedCycles;
        const acc = dutyAccum.get(id)!;
        for (const [k, v] of dutyByPortBit.entries()) {
          acc.set(k, (acc.get(k) ?? 0) + v / sliceCount);
        }
        allMcuPins.push(...sim.collectMcuPins(dutyByPortBit));
      }

      const dtSeconds = sliceElapsed / UNO_CLOCK_HZ;
      lastSolved = this.solver.solve(this.parts, this.manifests, this.netlist, allMcuPins, dtSeconds, true);

      let relayChanged = false;
      for (const [id, energized] of Object.entries(lastSolved.relayEnergized)) {
        if (energized !== this.energizedRelays.has(id)) {
          relayChanged = true;
          if (energized) this.energizedRelays.add(id);
          else this.energizedRelays.delete(id);
        }
      }
      if (relayChanged) {
        this.netlist = buildNetlist(this.parts, this.wires, this.manifests, {
          pressedButtons: this.pressedButtons,
          pressedKeypadKeys: this.pressedKeypadKeys,
          energizedRelays: this.energizedRelays,
        });
        for (const sim of this.sims.values()) {
          sim.updateSharedNetlist(this.netlist);
        }
        this.rebuildUartRoutes();
        lastSolved = this.solver.solve(this.parts, this.manifests, this.netlist, allMcuPins, dtSeconds, false);
      }

      const tmpV: Record<string, number> = {};
      for (const sim of this.sims.values()) {
        sim.applyBoardVoltages(lastSolved.netVoltages, tmpV);
      }
    }

    const pinVoltages: Record<string, number> = {};
    const onboardLeds: Record<string, boolean> = {};
    const servoAngles: Record<string, number> = {};
    const servo360States: Record<string, Servo360VisualState> = {};
    const buzzerHz: Record<string, number> = {};
    const lcdDisplays: Record<string, LcdDisplayState> = {};
    const oledDisplays: Record<string, OledDisplayState> = {};
    const max7219Displays: Record<string, Max7219State> = {};
    const neoPixelStrips: Record<string, Array<[number, number, number]>> = {};
    const stepperStates: Record<string, StepperVisualState> = {};
    const rtcTimes: Record<string, string> = {};
    const bluetoothLogs: Record<string, string> = {};
    let maxCycles = 0;

    for (const [id, sim] of this.sims.entries()) {
      maxCycles = Math.max(maxCycles, sim.cpu.cycles);
      sim.applyBoardVoltages(lastSolved.netVoltages, pinVoltages);
      const att = sim.collectAttachedSnapshot(dutyAccum.get(id)!);
      onboardLeds[id] = att.onboardLed;
      Object.assign(servoAngles, att.servoAngles);
      Object.assign(servo360States, att.servo360States);
      Object.assign(buzzerHz, att.buzzerHz);
      Object.assign(lcdDisplays, att.lcdDisplays);
      Object.assign(oledDisplays, att.oledDisplays);
      Object.assign(max7219Displays, att.max7219Displays);
      Object.assign(neoPixelStrips, att.neoPixelStrips);
      Object.assign(stepperStates, att.stepperStates);
      Object.assign(rtcTimes, att.rtcTimes);
      Object.assign(bluetoothLogs, att.bluetoothLogs);
    }

    for (const part of this.parts) {
      const manifest = this.manifests.get(part.type);
      if (!manifest || part.type === 'breadboard-half') continue;
      for (const pin of manifest.pins) {
        const key = `${part.id}:${pin.id}`;
        const net = this.netlist.pinToNet.get(key);
        if (net !== undefined) {
          const v = lastSolved.netVoltages.get(net);
          if (v !== undefined) pinVoltages[key] = v;
        }
      }
    }

    const firstId = this.sims.keys().next().value;
    return {
      running: this.running,
      timeMs: Math.round((maxCycles / UNO_CLOCK_HZ) * 1000),
      onboardLed: firstId ? Boolean(onboardLeds[firstId]) : false,
      onboardLeds,
      ledStates: lastSolved.ledStates,
      rgbLedStates: lastSolved.rgbLedStates,
      sevenSegStates: lastSolved.sevenSegStates,
      capacitorVoltages: lastSolved.capacitorVoltages,
      diodeConducting: lastSolved.diodeConducting,
      servoAngles,
      servo360States,
      buzzerHz,
      relayEnergized: lastSolved.relayEnergized,
      motorStates: lastSolved.motorStates,
      converterStates: lastSolved.converterStates,
      l298nStates: lastSolved.l298nStates,
      stepperStates,
      lcdDisplays,
      oledDisplays,
      max7219Displays,
      neoPixelStrips,
      rtcTimes,
      bluetoothLogs,
      pinVoltages,
      warnings: lastSolved.warnings,
    };
  }
}
