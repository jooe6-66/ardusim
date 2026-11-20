export type Lang = 'id' | 'en';

export interface Messages {
  appName: string;
  boardLabel: string;
  boardUno: string;
  boardNano: string;
  boardMega: string;
  run: string;
  stop: string;
  compiling: string;
  fileMenu: string;
  newBlank: string;
  exportIno: string;
  importIno: string;
  inoLoadedNotice: string;
  canvasEmptyTitle: string;
  canvasEmptyDesc: string;
  openFileMenu: string;
  catMcu: string;
  addPart: string;
  inspector: string;
  tabCircuit: string;
  tabCode: string;
  tabSerial: string;
  modeAuto: string;
  modeWire: string;
  modeMove: string;
  modeDelete: string;
  modeAutoHint: string;
  modeWireHint: string;
  modeMoveHint: string;
  modeDeleteHint: string;
  undo: string;
  redo: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  tidyWires: string;
  tidyWiresHint: string;
  rotate: string;
  deleteSelected: string;
  cancelWire: string;
  wiringPrompt: (pinLabel: string) => string;
  themeLight: string;
  themeDark: string;
  statusIdle: string;
  statusRunning: string;
  statusOfflineCached: string;
  statusWaking: (elapsedSec: number) => string;
  statusCompiled: (ms: number, cached: boolean) => string;
  statusCompileError: string;
  compileErrorHint: string;
  offlineNoCacheError: string;
  partPickerTitle: string;
  partSearchPlaceholder: string;
  partSearchEmpty: string;
  catAll: string;
  catBreadboard: string;
  catPassive: string;
  catSensor: string;
  catDisplay: string;
  catInput: string;
  catOutput: string;
  catMotor: string;
  inspectorEmpty: string;
  inspectorWireTitle: string;
  valueLabel: string;
  unitLabel: string;
  kindLabel: string;
  kindCeramic: string;
  kindElectrolytic: string;
  diodeModelLabel: string;
  forwardVoltageLabel: string;
  zenerVoltageLabel: string;
  ledColorLabel: string;
  ledCurrentLabel: string;
  ledOvercurrentWarn: string;
  capVoltageLabel: string;
  capReverseWarn: string;
  diodeStateLabel: string;
  diodeConducting: string;
  diodeBlocking: string;
  potPositionLabel: string;
  buttonPress: string;
  buttonLatch: string;
  buttonPressed: string;
  buttonReleased: string;
  distanceLabel: string;
  tempLabel: string;
  humidityLabel: string;
  dhtModelLabel: string;
  pirMotionLabel: string;
  pirDetected: string;
  pirClear: string;
  ldrLuxLabel: string;
  gasLevelLabel: string;
  gasThresholdLabel: string;
  i2cAddrLabel: string;
  lcdColorLabel: string;
  lcdGreen: string;
  lcdBlue: string;
  commonModeLabel: string;
  commonCathode: string;
  commonAnode: string;
  relayTriggerLabel: string;
  relayActiveHigh: string;
  relayActiveLow: string;
  relayStateLabel: string;
  relayEnergized: string;
  relayIdle: string;
  servoAngleLabel: string;
  buzzerFreqLabel: string;
  buzzerAudioOn: string;
  buzzerAudioOff: string;
  motorSpeedLabel: string;
  keypadHint: string;
  rfidTapCard: string;
  rfidRemoveCard: string;
  rfidUidLabel: string;
  rfidStatusLabel: string;
  rfidPresent: string;
  rfidAbsent: string;
  pitchLabel: string;
  rollLabel: string;
  rtcTimeLabel: string;
  stepperStepsLabel: string;
  stepsPerRevLabel: string;
  latLabel: string;
  lonLabel: string;
  speedLabel: string;
  btTerminalLabel: string;
  btSendPlaceholder: string;
  btEmpty: string;
  libsHeading: string;
  wireColorLabel: string;
  wireRemove: string;
  serialTitle: string;
  serialClear: string;
  serialSend: string;
  serialInputPlaceholder: string;
  serialEmptyIdle: string;
  serialEmptyRunning: string;
  serialAutoscroll: string;
  projectsTitle: string;
  templatesHeading: string;
  savedProjectsHeading: string;
  savedEmpty: string;
  saveCurrent: string;
  savedNotice: string;
  projectNameLabel: string;
  exportJson: string;
  importJson: string;
  importHex: string;
  hexLoadedNotice: string;
  invalidFileError: string;
  touchGuideHeading: string;
  touchGuideTap: string;
  touchGuidePinch: string;
  touchGuideWire: string;
  close: string;
  load: string;
  remove: string;
  warningsTitle: string;
}

export const MESSAGES: Record<Lang, Messages> = {
  id: {
    appName: 'ArduSim',
    boardLabel: 'Board',
    boardUno: 'Arduino Uno',
    boardNano: 'Arduino Nano',
    boardMega: 'Arduino Mega 2560',
    run: 'Jalankan',
    stop: 'Berhenti',
    compiling: 'Mengompilasi...',
    fileMenu: 'File',
    newBlank: 'Baru (Kosong)',
    exportIno: 'Ekspor .ino',
    importIno: 'Impor .ino',
    inoLoadedNotice: 'File sketch .ino berhasil dimuat ke editor.',
    canvasEmptyTitle: 'Kanvas Kosong',
    canvasEmptyDesc: 'Tambahkan board Arduino atau komponen untuk mulai merangkai, atau buka proyek/contoh lewat menu File.',
    openFileMenu: 'Buka Menu File',
    catMcu: 'Board Arduino',
    addPart: 'Komponen',
    inspector: 'Properti',
    tabCircuit: 'Rangkaian',
    tabCode: 'Kode',
    tabSerial: 'Serial',
    modeAuto: 'Pintar',
    modeWire: 'Kabel',
    modeMove: 'Geser',
    modeDelete: 'Hapus',
    modeAutoHint: 'Mode Pintar: ketuk pin untuk kabel, seret komponen untuk geser, 2 jari untuk zoom.',
    modeWireHint: 'Mode Kabel: ketuk pin A lalu pin B (titik pin ditampilkan).',
    modeMoveHint: 'Mode Geser: seret komponen atau kanvas tanpa takut salah tarik kabel.',
    modeDeleteHint: 'Mode Hapus: ketuk kabel atau komponen mana saja untuk langsung menghapus.',
    undo: 'Urungkan',
    redo: 'Ulangi',
    zoomIn: 'Perbesar',
    zoomOut: 'Perkecil',
    zoomFit: 'Pas Layar',
    tidyWires: 'Rapikan',
    tidyWiresHint: 'Atur ulang semua kabel secara otomatis agar rapi dan tidak menabrak komponen',
    rotate: 'Putar 90°',
    deleteSelected: 'Hapus',
    cancelWire: 'Batal Kabel',
    wiringPrompt: (pin) => `Dari ${pin}: ketuk pin tujuan atau area kosong untuk belok`,
    themeLight: 'Mode Terang',
    themeDark: 'Mode Gelap',
    statusIdle: 'Siap',
    statusRunning: 'Berjalan',
    statusOfflineCached: 'Berjalan offline (cache .hex)',
    statusWaking: (sec) => `Membangunkan server compiler... (${sec} dtk)`,
    statusCompiled: (ms, cached) => (cached ? 'Compile dari cache' : `Compile selesai (${ms} ms)`),
    statusCompileError: 'Error kompilasi',
    compileErrorHint: 'Periksa baris kode yang ditandai lalu coba Jalankan lagi.',
    offlineNoCacheError: 'Server compiler tidak terjangkau dan belum ada cache .hex untuk kode ini. Sambungkan ke server compiler atau impor file .hex.',
    partPickerTitle: 'Tambah Komponen',
    partSearchPlaceholder: 'Cari ultrasonik, LCD, OLED, servo, resistor, DHT...',
    partSearchEmpty: 'Tidak ada komponen yang cocok dengan pencarian.',
    catAll: 'Semua',
    catBreadboard: 'Breadboard',
    catPassive: 'Pasif',
    catSensor: 'Sensor',
    catDisplay: 'Layar',
    catInput: 'Input',
    catOutput: 'Output',
    catMotor: 'Motor',
    inspectorEmpty: 'Ketuk komponen atau kabel di kanvas untuk mengubah nilai, satuan, sensor, atau warna.',
    inspectorWireTitle: 'Properti Kabel',
    valueLabel: 'Nilai',
    unitLabel: 'Satuan',
    kindLabel: 'Jenis Kapasitor',
    kindCeramic: 'Keramik (Non-polar)',
    kindElectrolytic: 'Elektrolit (Polar +/-)',
    diodeModelLabel: 'Tipe Dioda',
    forwardVoltageLabel: 'Tegangan Maju (Vf)',
    zenerVoltageLabel: 'Tegangan Zener (Vz)',
    ledColorLabel: 'Warna LED',
    ledCurrentLabel: 'Arus LED',
    ledOvercurrentWarn: 'Arus melebihi 30 mA. Tambahkan resistor seri (misal 220 Ω).',
    capVoltageLabel: 'Tegangan Kapasitor',
    capReverseWarn: 'Polaritas terbalik pada kapasitor elektrolit.',
    diodeStateLabel: 'Status Dioda',
    diodeConducting: 'Menghantar (Forward)',
    diodeBlocking: 'Menahan (Reverse / Off)',
    potPositionLabel: 'Posisi Putaran',
    buttonPress: 'Tekan Tombol',
    buttonLatch: 'Kunci Tahan (Touch)',
    buttonPressed: 'Ditekan (Terhubung)',
    buttonReleased: 'Dilepas (Terbuka)',
    distanceLabel: 'Jarak Objek (cm)',
    tempLabel: 'Suhu (°C)',
    humidityLabel: 'Kelembapan (%RH)',
    dhtModelLabel: 'Tipe Sensor DHT',
    pirMotionLabel: 'Simulasi Gerakan PIR',
    pirDetected: 'Gerakan Terdeteksi (HIGH)',
    pirClear: 'Tidak Ada Gerakan (LOW)',
    ldrLuxLabel: 'Intensitas Cahaya (Lux)',
    gasLevelLabel: 'Konsentrasi Gas (%)',
    gasThresholdLabel: 'Ambang DOUT (%)',
    i2cAddrLabel: 'Alamat I2C',
    lcdColorLabel: 'Warna Lampu Latar',
    lcdGreen: 'Hijau Klasik',
    lcdBlue: 'Biru Kontras',
    commonModeLabel: 'Konfigurasi Common',
    commonCathode: 'Common Cathode (-)',
    commonAnode: 'Common Anode (+)',
    relayTriggerLabel: 'Logika Pemicu Relay',
    relayActiveHigh: 'Aktif HIGH (5V)',
    relayActiveLow: 'Aktif LOW (0V)',
    relayStateLabel: 'Kontak Relay',
    relayEnergized: 'Aktif (COM -> NO)',
    relayIdle: 'Standby (COM -> NC)',
    servoAngleLabel: 'Sudut Servo',
    buzzerFreqLabel: 'Frekuensi Nada',
    buzzerAudioOn: 'Suara Buzzer: Aktif',
    buzzerAudioOff: 'Suara Buzzer: Bisukan',
    motorSpeedLabel: 'Kecepatan & Tegangan',
    keypadHint: 'Ketuk dan tahan tombol di bawah saat simulasi berjalan:',
    rfidTapCard: 'Tempel Kartu RFID',
    rfidRemoveCard: 'Angkat Kartu RFID',
    rfidUidLabel: 'UID Kartu (8 digit Hex)',
    rfidStatusLabel: 'Status Kartu',
    rfidPresent: 'Kartu Terdeteksi',
    rfidAbsent: 'Tidak Ada Kartu',
    pitchLabel: 'Kemiringan Pitch (°)',
    rollLabel: 'Kemiringan Roll (°)',
    rtcTimeLabel: 'Jam RTC DS3231',
    stepperStepsLabel: 'Posisi Stepper',
    stepsPerRevLabel: 'Langkah / Putaran',
    latLabel: 'Lintang (Latitude)',
    lonLabel: 'Bujur (Longitude)',
    speedLabel: 'Kecepatan (knot)',
    btTerminalLabel: 'Terminal Bluetooth HC-05',
    btSendPlaceholder: 'Kirim pesan via HC-05...',
    btEmpty: 'Belum ada data dari Arduino.',
    libsHeading: 'Library Arduino Siap Pakai',
    wireColorLabel: 'Warna Kabel',
    wireRemove: 'Hapus Kabel',
    serialTitle: 'Serial Monitor',
    serialClear: 'Bersihkan',
    serialSend: 'Kirim',
    serialInputPlaceholder: 'Kirim teks ke Arduino RX...',
    serialEmptyIdle: 'Jalankan simulasi untuk melihat output Serial.print().',
    serialEmptyRunning: 'Simulasi berjalan. Menunggu data dari Serial.print()...',
    serialAutoscroll: 'Gulir otomatis',
    projectsTitle: 'Menu File & Proyek',
    templatesHeading: 'Contoh Siap Pakai (Jalan Offline)',
    savedProjectsHeading: 'Tersimpan di Perangkat (IndexedDB)',
    savedEmpty: 'Belum ada proyek tersimpan di perangkat ini.',
    saveCurrent: 'Simpan Proyek',
    savedNotice: 'Proyek tersimpan di perangkat.',
    projectNameLabel: 'Nama Proyek',
    exportJson: 'Ekspor JSON',
    importJson: 'Impor JSON',
    importHex: 'Impor .hex',
    hexLoadedNotice: 'File .hex siap dijalankan offline.',
    invalidFileError: 'Format file tidak valid.',
    touchGuideHeading: 'Panduan Layar Sentuh',
    touchGuideTap: 'Ketuk pin A lalu ketuk pin B untuk menyambungkan kabel jumper.',
    touchGuidePinch: 'Gunakan 2 jari untuk cubit (zoom) dan geser kanvas.',
    touchGuideWire: 'Ketuk kabel untuk ganti warna atau hapus. Ketuk sensor/komponen untuk ubah nilai & slider.',
    close: 'Tutup',
    load: 'Buka',
    remove: 'Hapus',
    warningsTitle: 'Peringatan Rangkaian',
  },
  en: {
    appName: 'ArduSim',
    boardLabel: 'Board',
    boardUno: 'Arduino Uno',
    boardNano: 'Arduino Nano',
    boardMega: 'Arduino Mega 2560',
    run: 'Run',
    stop: 'Stop',
    compiling: 'Compiling...',
    fileMenu: 'File',
    newBlank: 'New (Blank)',
    exportIno: 'Export .ino',
    importIno: 'Import .ino',
    inoLoadedNotice: 'Arduino .ino sketch loaded into editor.',
    canvasEmptyTitle: 'Empty Workbench',
    canvasEmptyDesc: 'Add an Arduino board or components to start wiring, or open a saved project or template from the File menu.',
    openFileMenu: 'Open File Menu',
    catMcu: 'Arduino Boards',
    addPart: 'Parts',
    inspector: 'Inspector',
    tabCircuit: 'Circuit',
    tabCode: 'Code',
    tabSerial: 'Serial',
    modeAuto: 'Smart',
    modeWire: 'Wire',
    modeMove: 'Move',
    modeDelete: 'Delete',
    modeAutoHint: 'Smart Mode: tap pins to wire, drag parts to move, pinch with 2 fingers to zoom.',
    modeWireHint: 'Wire Mode: tap pin A then pin B (all pin anchors highlighted).',
    modeMoveHint: 'Move Mode: drag parts or pan canvas without starting wires by mistake.',
    modeDeleteHint: 'Delete Mode: tap any wire or component to remove it immediately.',
    undo: 'Undo',
    redo: 'Redo',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomFit: 'Fit View',
    tidyWires: 'Tidy Wires',
    tidyWiresHint: 'Auto-route all jumper wires cleanly around components without overlapping',
    rotate: 'Rotate 90°',
    deleteSelected: 'Delete',
    cancelWire: 'Cancel Wire',
    wiringPrompt: (pin) => `From ${pin}: tap destination pin or empty space to add a bend`,
    themeLight: 'Light Mode',
    themeDark: 'Dark Mode',
    statusIdle: 'Ready',
    statusRunning: 'Running',
    statusOfflineCached: 'Running offline (.hex cache)',
    statusWaking: (sec) => `Waking up compiler server... (${sec}s)`,
    statusCompiled: (ms, cached) => (cached ? 'Loaded from cache' : `Compiled in ${ms} ms`),
    statusCompileError: 'Compile error',
    compileErrorHint: 'Fix the highlighted line in Code and press Run again.',
    offlineNoCacheError: 'Compiler server is unreachable and no cached .hex exists for this sketch. Connect to the compiler or import a .hex file.',
    partPickerTitle: 'Add Component',
    partSearchPlaceholder: 'Search ultrasonic, LCD, OLED, servo, resistor, DHT...',
    partSearchEmpty: 'No components match your search.',
    catAll: 'All',
    catBreadboard: 'Breadboard',
    catPassive: 'Passive',
    catSensor: 'Sensors',
    catDisplay: 'Displays',
    catInput: 'Inputs',
    catOutput: 'Outputs',
    catMotor: 'Motors',
    inspectorEmpty: 'Tap any component or wire on the canvas to edit values, units, sensor sliders, or wire color.',
    inspectorWireTitle: 'Wire Properties',
    valueLabel: 'Value',
    unitLabel: 'Unit',
    kindLabel: 'Capacitor Type',
    kindCeramic: 'Ceramic (Non-polar)',
    kindElectrolytic: 'Electrolytic (Polar +/-)',
    diodeModelLabel: 'Diode Model',
    forwardVoltageLabel: 'Forward Voltage (Vf)',
    zenerVoltageLabel: 'Zener Voltage (Vz)',
    ledColorLabel: 'LED Color',
    ledCurrentLabel: 'LED Current',
    ledOvercurrentWarn: 'Current exceeds 30 mA. Add a series resistor (for example 220 Ω).',
    capVoltageLabel: 'Capacitor Voltage',
    capReverseWarn: 'Reverse polarity detected on electrolytic capacitor.',
    diodeStateLabel: 'Diode State',
    diodeConducting: 'Conducting (Forward)',
    diodeBlocking: 'Blocking (Reverse / Off)',
    potPositionLabel: 'Knob Position',
    buttonPress: 'Press Button',
    buttonLatch: 'Hold Latch (Touch)',
    buttonPressed: 'Pressed (Closed)',
    buttonReleased: 'Released (Open)',
    distanceLabel: 'Object Distance (cm)',
    tempLabel: 'Temperature (°C)',
    humidityLabel: 'Humidity (%RH)',
    dhtModelLabel: 'DHT Sensor Model',
    pirMotionLabel: 'PIR Motion Trigger',
    pirDetected: 'Motion Detected (HIGH)',
    pirClear: 'No Motion (LOW)',
    ldrLuxLabel: 'Light Intensity (Lux)',
    gasLevelLabel: 'Gas Concentration (%)',
    gasThresholdLabel: 'DOUT Threshold (%)',
    i2cAddrLabel: 'I2C Address',
    lcdColorLabel: 'Backlight Color',
    lcdGreen: 'Classic Green',
    lcdBlue: 'High-Contrast Blue',
    commonModeLabel: 'Common Pin Mode',
    commonCathode: 'Common Cathode (-)',
    commonAnode: 'Common Anode (+)',
    relayTriggerLabel: 'Relay Trigger Logic',
    relayActiveHigh: 'Active HIGH (5V)',
    relayActiveLow: 'Active LOW (0V)',
    relayStateLabel: 'Relay Contact',
    relayEnergized: 'Energized (COM -> NO)',
    relayIdle: 'Idle (COM -> NC)',
    servoAngleLabel: 'Servo Angle',
    buzzerFreqLabel: 'Tone Frequency',
    buzzerAudioOn: 'Buzzer Audio: On',
    buzzerAudioOff: 'Buzzer Audio: Muted',
    motorSpeedLabel: 'Speed & Voltage',
    keypadHint: 'Tap and hold keys below while the simulation runs:',
    rfidTapCard: 'Tap RFID Card',
    rfidRemoveCard: 'Remove RFID Card',
    rfidUidLabel: 'Card UID (8 Hex digits)',
    rfidStatusLabel: 'Card Status',
    rfidPresent: 'Card on Reader',
    rfidAbsent: 'No Card',
    pitchLabel: 'Pitch Angle (°)',
    rollLabel: 'Roll Angle (°)',
    rtcTimeLabel: 'DS3231 Clock Time',
    stepperStepsLabel: 'Stepper Position',
    stepsPerRevLabel: 'Steps / Revolution',
    latLabel: 'Latitude',
    lonLabel: 'Longitude',
    speedLabel: 'Speed (knots)',
    btTerminalLabel: 'HC-05 Bluetooth Terminal',
    btSendPlaceholder: 'Send message over HC-05...',
    btEmpty: 'No data received from Arduino yet.',
    libsHeading: 'Pre-installed Arduino Libraries',
    wireColorLabel: 'Wire Color',
    wireRemove: 'Delete Wire',
    serialTitle: 'Serial Monitor',
    serialClear: 'Clear',
    serialSend: 'Send',
    serialInputPlaceholder: 'Send text to Arduino RX...',
    serialEmptyIdle: 'Start the simulation to inspect Serial.print() output.',
    serialEmptyRunning: 'Simulation running. Waiting for Serial.print() data...',
    serialAutoscroll: 'Autoscroll',
    projectsTitle: 'File & Projects',
    templatesHeading: 'Starter Templates (Run Offline)',
    savedProjectsHeading: 'Saved on Device (IndexedDB)',
    savedEmpty: 'No saved projects on this device yet.',
    saveCurrent: 'Save Project',
    savedNotice: 'Project saved locally.',
    projectNameLabel: 'Project Name',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    importHex: 'Import .hex',
    hexLoadedNotice: 'Imported .hex is ready to run offline.',
    invalidFileError: 'Invalid file format.',
    touchGuideHeading: 'Touchscreen Controls',
    touchGuideTap: 'Tap pin A then tap pin B to route a clean jumper wire.',
    touchGuidePinch: 'Use two fingers to pinch-zoom and pan the workbench.',
    touchGuideWire: 'Tap a wire to recolor or delete. Tap any sensor or part to adjust values and sliders.',
    close: 'Close',
    load: 'Open',
    remove: 'Delete',
    warningsTitle: 'Circuit Warnings',
  },
};
