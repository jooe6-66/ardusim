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
  inoLoadedNotice: string;
  canvasEmptyTitle: string;
  canvasEmptyDesc: string;
  openFileMenu: string;
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
  runningAutoHint: string;
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
  tidyWiresOnlyHint: string;
  rotate: string;
  flipH: string;
  flipV: string;
  deleteSelected: string;
  cancelWire: string;
  wiringPrompt: (pinLabel: string) => string;
  themeLight: string;
  themeDark: string;
  statusIdle: string;
  statusRunning: string;
  statusOfflineCached: string;
  statusCompilerWaking: string;
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
  catPower: string;
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
  wireEditHint: string;
  wireResetShape: string;
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
  importFile: string;
  importFileHint: string;
  exportFormatLabel: string;
  downloadBtn: string;
  exportOptPng: string;
  exportOptSvg: string;
  exportOptJpg: string;
  exportOptJson: string;
  exportOptIno: string;
  exportDoneNotice: (fmt: string) => string;
  exportImageEmpty: string;
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
  partAddedToast: (name: string) => string;
  wiresTidiedToast: string;
  boardSwitchedToast: (name: string) => string;
  partsCount: (n: number) => string;
  wiresCount: (n: number) => string;
  clearSearch: string;
  resizeHandleLabel: string;
  batteryCellsLabel: string;
  batteryVoltageLabel: string;
  converterTargetLabel: string;
  converterInputLabel: string;
  converterOutputLabel: string;
  converterStatusLabel: string;
  converterActive: string;
  converterOff: string;
  l298nSupplyLabel: string;
  l298nChanALabel: string;
  l298nChanBLabel: string;
  l298nReg5vLabel: string;
  l298nReg5vOn: string;
  l298nReg5vOff: string;
  ctxMenuLabel: string;
  ctxCanvasTitle: string;
  ctxCopy: string;
  ctxPaste: string;
  ctxPasteHere: string;
  ctxDuplicate: string;
  copiedToast: (name: string) => string;
  pastedToast: (name: string) => string;
  duplicatedToast: (name: string) => string;
  autoWire: string;
  autoWireHint: string;
  autoWireToast: (parts: number, wires: number) => string;
  autoWireEmptyToast: string;
  autoWireAlreadyWiredToast: string;
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
    inoLoadedNotice: 'File sketch .ino berhasil dimuat ke editor.',
    canvasEmptyTitle: 'Kanvas Kosong',
    canvasEmptyDesc: 'Pilih board Arduino di pojok kiri atas, lalu tambahkan komponen untuk mulai merangkai atau buka contoh lewat menu File.',
    openFileMenu: 'Buka Menu File',
    addPart: 'Komponen',
    inspector: 'Properti',
    tabCircuit: 'Rangkaian',
    tabCode: 'Kode',
    tabSerial: 'Serial',
    modeAuto: 'Pintar',
    modeWire: 'Kabel',
    modeMove: 'Geser',
    modeDelete: 'Hapus',
    modeAutoHint: 'Mode Pintar: ketuk ujung pin untuk kabel, ketuk badan komponen untuk pilih/geser, 2 jari untuk zoom.',
    runningAutoHint: 'Simulasi aktif: ketuk tombol/keypad untuk tekan, ketuk sensor untuk atur nilai. Pilih mode Kabel untuk tambah kabel.',
    modeWireHint: 'Mode Kabel: ketuk pin A lalu pin B (titik pin ditampilkan).',
    modeMoveHint: 'Mode Geser: seret komponen atau kanvas tanpa takut salah tarik kabel.',
    modeDeleteHint: 'Mode Hapus: ketuk kabel atau komponen mana saja untuk langsung menghapus.',
    undo: 'Urungkan',
    redo: 'Ulangi',
    zoomIn: 'Perbesar',
    zoomOut: 'Perkecil',
    zoomFit: 'Pas Layar',
    tidyWires: 'Rapikan',
    tidyWiresHint: 'Atur ulang posisi komponen dan jalur kabel secara otomatis agar rapi dan berjarak',
    tidyWiresOnlyHint: 'Rapikan jalur kabel saja (posisi komponen manual tetap dipertahankan)',
    rotate: 'Putar 90°',
    flipH: 'Flip H',
    flipV: 'Flip V',
    deleteSelected: 'Hapus',
    cancelWire: 'Batal Kabel',
    wiringPrompt: (pin) => `Dari ${pin}: ketuk pin tujuan atau area kosong untuk belok`,
    themeLight: 'Mode Terang',
    themeDark: 'Mode Gelap',
    statusIdle: 'Siap',
    statusRunning: 'Berjalan',
    statusOfflineCached: 'Berjalan offline (cache .hex)',
    statusCompilerWaking: 'Menyiapkan compiler...',
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
    catPower: 'Daya',
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
    wireEditHint: 'Seret titik bulat untuk geser sudut, seret titik tengah garis untuk geser/belokkan kabel, ketuk ganda sudut untuk hapus belokan.',
    wireResetShape: 'Reset Jalur Kabel',
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
    importFile: 'Impor File',
    importFileHint: 'Impor proyek .json, sketch .ino, atau firmware .hex',
    exportFormatLabel: 'Format ekspor',
    downloadBtn: 'Unduh',
    exportOptPng: 'PNG (Gambar Wiring)',
    exportOptSvg: 'SVG (Vektor Wiring)',
    exportOptJpg: 'JPG (Gambar Wiring)',
    exportOptJson: 'JSON (Proyek)',
    exportOptIno: '.ino (Sketch)',
    exportDoneNotice: (fmt) => `Berhasil mengunduh ${fmt}.`,
    exportImageEmpty: 'Tambahkan komponen dulu untuk ekspor gambar.',
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
    partAddedToast: (name) => `${name} ditambahkan ke kanvas`,
    wiresTidiedToast: 'Jalur kabel dirapikan',
    boardSwitchedToast: (name) => `Board diganti ke ${name}`,
    partsCount: (n) => `${n} komponen`,
    wiresCount: (n) => `${n} kabel`,
    clearSearch: 'Reset pencarian',
    resizeHandleLabel: 'Geser untuk ubah lebar panel kode dan kanvas',
    batteryCellsLabel: 'Konfigurasi Seri 18650',
    batteryVoltageLabel: 'Tegangan Baterai',
    converterTargetLabel: 'Target Tegangan Keluar (Vout)',
    converterInputLabel: 'Tegangan Masuk (Vin)',
    converterOutputLabel: 'Tegangan Keluar (Vout)',
    converterStatusLabel: 'Status Konverter',
    converterActive: 'Aktif',
    converterOff: 'Input Kurang / Mati',
    l298nSupplyLabel: 'Suplai Motor (12V)',
    l298nChanALabel: 'Output Motor A (OUT1-2)',
    l298nChanBLabel: 'Output Motor B (OUT3-4)',
    l298nReg5vLabel: 'Regulator 5V Onboard',
    l298nReg5vOn: 'Jumper 5V: Aktif',
    l298nReg5vOff: 'Jumper 5V: Nonaktif',
    ctxMenuLabel: 'Menu konteks komponen',
    ctxCanvasTitle: 'Kanvas',
    ctxCopy: 'Salin',
    ctxPaste: 'Tempel',
    ctxPasteHere: 'Tempel di sini',
    ctxDuplicate: 'Duplikat',
    copiedToast: (name) => `${name} disalin`,
    pastedToast: (name) => `${name} ditempel ke kanvas`,
    duplicatedToast: (name) => `${name} diduplikat`,
    autoWire: 'Auto-Wire',
    autoWireHint: 'Otomatis tambahkan komponen dan sambungkan kabel sesuai kode sketch aktif',
    autoWireToast: (parts, wires) =>
      parts > 0
        ? `Auto-Wire: +${parts} komponen, ${wires} kabel tersambung`
        : `Auto-Wire: ${wires} kabel tersambung`,
    autoWireEmptyToast: 'Tidak ada pin komponen terdeteksi di kode sketch',
    autoWireAlreadyWiredToast: 'Semua pin kode sudah tersambung di kanvas',
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
    inoLoadedNotice: 'Arduino .ino sketch loaded into editor.',
    canvasEmptyTitle: 'Empty Workbench',
    canvasEmptyDesc: 'Choose an Arduino board in the top-left menu, then add components to start wiring or open a template from File.',
    openFileMenu: 'Open File Menu',
    addPart: 'Parts',
    inspector: 'Inspector',
    tabCircuit: 'Circuit',
    tabCode: 'Code',
    tabSerial: 'Serial',
    modeAuto: 'Smart',
    modeWire: 'Wire',
    modeMove: 'Move',
    modeDelete: 'Delete',
    modeAutoHint: 'Smart Mode: tap pin tips to wire, tap part bodies to select/drag, pinch with 2 fingers to zoom.',
    runningAutoHint: 'Simulation live: tap buttons/keypad to press, tap sensors to adjust values. Switch to Wire mode to add wires.',
    modeWireHint: 'Wire Mode: tap pin A then pin B (all pin anchors highlighted).',
    modeMoveHint: 'Move Mode: drag parts or pan canvas without starting wires by mistake.',
    modeDeleteHint: 'Delete Mode: tap any wire or component to remove it immediately.',
    undo: 'Undo',
    redo: 'Redo',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomFit: 'Fit View',
    tidyWires: 'Tidy',
    tidyWiresHint: 'Auto-arrange components and jumper wires cleanly with clear spacing',
    tidyWiresOnlyHint: 'Auto-route jumper wires only (preserves your manual component positions)',
    rotate: 'Rotate 90°',
    flipH: 'Flip H',
    flipV: 'Flip V',
    deleteSelected: 'Delete',
    cancelWire: 'Cancel Wire',
    wiringPrompt: (pin) => `From ${pin}: tap destination pin or empty space to add a bend`,
    themeLight: 'Light Mode',
    themeDark: 'Dark Mode',
    statusIdle: 'Ready',
    statusRunning: 'Running',
    statusOfflineCached: 'Running offline (.hex cache)',
    statusCompilerWaking: 'Waking compiler...',
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
    catPower: 'Power',
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
    wireEditHint: 'Drag round corner handles to move bends, drag segment midpoint handles to slide or add bends, double-tap a corner to remove it.',
    wireResetShape: 'Reset Wire Path',
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
    importFile: 'Import File',
    importFileHint: 'Import .json project, .ino sketch, or .hex firmware',
    exportFormatLabel: 'Export format',
    downloadBtn: 'Download',
    exportOptPng: 'PNG (Wiring Image)',
    exportOptSvg: 'SVG (Vector Wiring)',
    exportOptJpg: 'JPG (Wiring Image)',
    exportOptJson: 'JSON (Project)',
    exportOptIno: '.ino (Sketch)',
    exportDoneNotice: (fmt) => `Downloaded ${fmt}.`,
    exportImageEmpty: 'Add components first to export an image.',
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
    partAddedToast: (name) => `Added ${name} to canvas`,
    wiresTidiedToast: 'Wires tidied',
    boardSwitchedToast: (name) => `Switched board to ${name}`,
    partsCount: (n) => `${n} ${n === 1 ? 'part' : 'parts'}`,
    wiresCount: (n) => `${n} ${n === 1 ? 'wire' : 'wires'}`,
    clearSearch: 'Reset search',
    resizeHandleLabel: 'Drag to resize code and canvas panels',
    batteryCellsLabel: '18650 Series Pack',
    batteryVoltageLabel: 'Battery Voltage',
    converterTargetLabel: 'Target Output Voltage (Vout)',
    converterInputLabel: 'Input Voltage (Vin)',
    converterOutputLabel: 'Output Voltage (Vout)',
    converterStatusLabel: 'Converter Status',
    converterActive: 'Active',
    converterOff: 'Undervoltage / Off',
    l298nSupplyLabel: 'Motor Supply (12V)',
    l298nChanALabel: 'Motor A Output (OUT1-2)',
    l298nChanBLabel: 'Motor B Output (OUT3-4)',
    l298nReg5vLabel: 'Onboard 5V Regulator',
    l298nReg5vOn: '5V Jumper: Enabled',
    l298nReg5vOff: '5V Jumper: Disabled',
    ctxMenuLabel: 'Component context menu',
    ctxCanvasTitle: 'Canvas',
    ctxCopy: 'Copy',
    ctxPaste: 'Paste',
    ctxPasteHere: 'Paste here',
    ctxDuplicate: 'Duplicate',
    copiedToast: (name) => `Copied ${name}`,
    pastedToast: (name) => `Pasted ${name} to canvas`,
    duplicatedToast: (name) => `Duplicated ${name}`,
    autoWire: 'Auto-Wire',
    autoWireHint: 'Auto-add detected components and wire pins from active sketch code',
    autoWireToast: (parts, wires) =>
      parts > 0
        ? `Auto-Wire: +${parts} parts, ${wires} wires connected`
        : `Auto-Wire: ${wires} wires connected`,
    autoWireEmptyToast: 'No component pins detected in sketch code',
    autoWireAlreadyWiredToast: 'All sketch pins are already wired on canvas',
  },
};
