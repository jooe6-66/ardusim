import {
  ADCConfig,
  ADCMuxConfiguration,
  ADCMuxInputType,
  ADCReference,
  AVRTimerConfig,
  TWIConfig,
  portBConfig,
  portEConfig,
  portGConfig,
  portHConfig,
  portLConfig,
} from 'avr8js';

/**
 * Hardware peripheral configurations for ATmega2560 (Arduino Mega 2560),
 * verified directly against AVR-Libc `iomxx0_1.h`.
 * Word interrupt addresses = vectorNumber * 2 (4-byte JMP entries in 256 KB flash).
 */

const timer01Dividers = {
  0: 0,
  1: 1,
  2: 8,
  3: 64,
  4: 256,
  5: 1024,
  6: 0,
  7: 0,
};

const timer2Dividers = {
  0: 0,
  1: 1,
  2: 8,
  3: 32,
  4: 64,
  5: 128,
  6: 256,
  7: 1024,
};

const defaultBits8 = {
  TOV: 1,
  OCFA: 2,
  OCFB: 4,
  OCFC: 0,
  TOIE: 1,
  OCIEA: 2,
  OCIEB: 4,
  OCIEC: 0,
};

const defaultBits16WithC = {
  TOV: 1,
  OCFA: 2,
  OCFB: 4,
  OCFC: 8,
  TOIE: 1,
  OCIEA: 2,
  OCIEB: 4,
  OCIEC: 8,
};

export const megaTimer0Config: AVRTimerConfig = {
  bits: 8,
  captureInterrupt: 0,
  compAInterrupt: 0x2a,
  compBInterrupt: 0x2c,
  compCInterrupt: 0,
  ovfInterrupt: 0x2e,
  TIFR: 0x35,
  OCRA: 0x47,
  OCRB: 0x48,
  OCRC: 0,
  ICR: 0,
  TCNT: 0x46,
  TCCRA: 0x44,
  TCCRB: 0x45,
  TCCRC: 0,
  TIMSK: 0x6e,
  dividers: timer01Dividers,
  compPortA: portBConfig.PORT,
  compPinA: 7, // D13
  compPortB: portGConfig.PORT,
  compPinB: 5, // D4
  compPortC: 0,
  compPinC: 0,
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits8,
};

export const megaTimer1Config: AVRTimerConfig = {
  bits: 16,
  captureInterrupt: 0x20,
  compAInterrupt: 0x22,
  compBInterrupt: 0x24,
  compCInterrupt: 0x26,
  ovfInterrupt: 0x28,
  TIFR: 0x36,
  OCRA: 0x88,
  OCRB: 0x8a,
  OCRC: 0x8c,
  ICR: 0x86,
  TCNT: 0x84,
  TCCRA: 0x80,
  TCCRB: 0x81,
  TCCRC: 0x82,
  TIMSK: 0x6f,
  dividers: timer01Dividers,
  compPortA: portBConfig.PORT,
  compPinA: 5, // D11
  compPortB: portBConfig.PORT,
  compPinB: 6, // D12
  compPortC: portBConfig.PORT,
  compPinC: 7, // D13
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits16WithC,
};

export const megaTimer2Config: AVRTimerConfig = {
  bits: 8,
  captureInterrupt: 0,
  compAInterrupt: 0x1a,
  compBInterrupt: 0x1c,
  compCInterrupt: 0,
  ovfInterrupt: 0x1e,
  TIFR: 0x37,
  OCRA: 0xb3,
  OCRB: 0xb4,
  OCRC: 0,
  ICR: 0,
  TCNT: 0xb2,
  TCCRA: 0xb0,
  TCCRB: 0xb1,
  TCCRC: 0,
  TIMSK: 0x70,
  dividers: timer2Dividers,
  compPortA: portBConfig.PORT,
  compPinA: 4, // D10
  compPortB: portHConfig.PORT,
  compPinB: 6, // D9
  compPortC: 0,
  compPinC: 0,
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits8,
};

export const megaTimer3Config: AVRTimerConfig = {
  bits: 16,
  captureInterrupt: 0x3e,
  compAInterrupt: 0x40,
  compBInterrupt: 0x42,
  compCInterrupt: 0x44,
  ovfInterrupt: 0x46,
  TIFR: 0x38,
  OCRA: 0x98,
  OCRB: 0x9a,
  OCRC: 0x9c,
  ICR: 0x96,
  TCNT: 0x94,
  TCCRA: 0x90,
  TCCRB: 0x91,
  TCCRC: 0x92,
  TIMSK: 0x71,
  dividers: timer01Dividers,
  compPortA: portEConfig.PORT,
  compPinA: 3, // D5
  compPortB: portEConfig.PORT,
  compPinB: 4, // D2
  compPortC: portEConfig.PORT,
  compPinC: 5, // D3
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits16WithC,
};

export const megaTimer4Config: AVRTimerConfig = {
  bits: 16,
  captureInterrupt: 0x52,
  compAInterrupt: 0x54,
  compBInterrupt: 0x56,
  compCInterrupt: 0x58,
  ovfInterrupt: 0x5a,
  TIFR: 0x39,
  OCRA: 0xa8,
  OCRB: 0xaa,
  OCRC: 0xac,
  ICR: 0xa6,
  TCNT: 0xa4,
  TCCRA: 0xa0,
  TCCRB: 0xa1,
  TCCRC: 0xa2,
  TIMSK: 0x72,
  dividers: timer01Dividers,
  compPortA: portHConfig.PORT,
  compPinA: 3, // D6
  compPortB: portHConfig.PORT,
  compPinB: 4, // D7
  compPortC: portHConfig.PORT,
  compPinC: 5, // D8
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits16WithC,
};

export const megaTimer5Config: AVRTimerConfig = {
  bits: 16,
  captureInterrupt: 0x5c,
  compAInterrupt: 0x5e,
  compBInterrupt: 0x60,
  compCInterrupt: 0x62,
  ovfInterrupt: 0x64,
  TIFR: 0x3a,
  OCRA: 0x128,
  OCRB: 0x12a,
  OCRC: 0x12c,
  ICR: 0x126,
  TCNT: 0x124,
  TCCRA: 0x120,
  TCCRB: 0x121,
  TCCRC: 0x122,
  TIMSK: 0x73,
  dividers: timer01Dividers,
  compPortA: portLConfig.PORT,
  compPinA: 3, // D46
  compPortB: portLConfig.PORT,
  compPinB: 4, // D45
  compPortC: portLConfig.PORT,
  compPinC: 5, // D44
  externalClockPort: 0,
  externalClockPin: 0,
  ...defaultBits16WithC,
};

export const megaUsart0Config = {
  rxCompleteInterrupt: 0x32,
  dataRegisterEmptyInterrupt: 0x34,
  txCompleteInterrupt: 0x36,
  UCSRA: 0xc0,
  UCSRB: 0xc1,
  UCSRC: 0xc2,
  UBRRL: 0xc4,
  UBRRH: 0xc5,
  UDR: 0xc6,
};

export const megaUsart1Config = {
  rxCompleteInterrupt: 0x48,
  dataRegisterEmptyInterrupt: 0x4a,
  txCompleteInterrupt: 0x4c,
  UCSRA: 0xc8,
  UCSRB: 0xc9,
  UCSRC: 0xca,
  UBRRL: 0xcc,
  UBRRH: 0xcd,
  UDR: 0xce,
};

export const megaUsart2Config = {
  rxCompleteInterrupt: 0x66,
  dataRegisterEmptyInterrupt: 0x68,
  txCompleteInterrupt: 0x6a,
  UCSRA: 0xd0,
  UCSRB: 0xd1,
  UCSRC: 0xd2,
  UBRRL: 0xd4,
  UBRRH: 0xd5,
  UDR: 0xd6,
};

export const megaUsart3Config = {
  rxCompleteInterrupt: 0x6c,
  dataRegisterEmptyInterrupt: 0x6e,
  txCompleteInterrupt: 0x70,
  UCSRA: 0x130,
  UCSRB: 0x131,
  UCSRC: 0x132,
  UBRRL: 0x134,
  UBRRH: 0x135,
  UDR: 0x136,
};

export const megaTwiConfig: TWIConfig = {
  twiInterrupt: 0x4e,
  TWBR: 0xb8,
  TWSR: 0xb9,
  TWAR: 0xba,
  TWDR: 0xbb,
  TWCR: 0xbc,
  TWAMR: 0xbd,
};

export const megaSpiConfig = {
  spiInterrupt: 0x30,
  SPCR: 0x4c,
  SPSR: 0x4d,
  SPDR: 0x4e,
};

const atmega2560Channels: ADCMuxConfiguration = {
  // MUX5 = 0 -> A0..A7
  0: { type: ADCMuxInputType.SingleEnded, channel: 0 },
  1: { type: ADCMuxInputType.SingleEnded, channel: 1 },
  2: { type: ADCMuxInputType.SingleEnded, channel: 2 },
  3: { type: ADCMuxInputType.SingleEnded, channel: 3 },
  4: { type: ADCMuxInputType.SingleEnded, channel: 4 },
  5: { type: ADCMuxInputType.SingleEnded, channel: 5 },
  6: { type: ADCMuxInputType.SingleEnded, channel: 6 },
  7: { type: ADCMuxInputType.SingleEnded, channel: 7 },
  30: { type: ADCMuxInputType.Constant, voltage: 1.1 },
  31: { type: ADCMuxInputType.Constant, voltage: 0 },
  // MUX5 = 1 (0x20) -> A8..A15
  32: { type: ADCMuxInputType.SingleEnded, channel: 8 },
  33: { type: ADCMuxInputType.SingleEnded, channel: 9 },
  34: { type: ADCMuxInputType.SingleEnded, channel: 10 },
  35: { type: ADCMuxInputType.SingleEnded, channel: 11 },
  36: { type: ADCMuxInputType.SingleEnded, channel: 12 },
  37: { type: ADCMuxInputType.SingleEnded, channel: 13 },
  38: { type: ADCMuxInputType.SingleEnded, channel: 14 },
  39: { type: ADCMuxInputType.SingleEnded, channel: 15 },
};

export const megaAdcConfig: ADCConfig = {
  ADMUX: 0x7c,
  ADCSRA: 0x7a,
  ADCSRB: 0x7b,
  ADCL: 0x78,
  ADCH: 0x79,
  DIDR0: 0x7e,
  adcInterrupt: 0x3a,
  numChannels: 16,
  muxInputMask: 0x3f,
  muxChannels: atmega2560Channels,
  adcReferences: [
    ADCReference.AREF,
    ADCReference.AVCC,
    ADCReference.Internal1V1,
    ADCReference.Internal2V56,
  ],
};
