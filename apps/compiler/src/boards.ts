import { BoardId } from '@ardusim/sim-core';

export interface BoardCompileSpec {
  id: BoardId;
  name: string;
  fqbn: string;
}

export const BOARD_SPECS: Record<BoardId, BoardCompileSpec> = {
  'arduino-uno': {
    id: 'arduino-uno',
    name: 'Arduino Uno',
    fqbn: 'arduino:avr:uno',
  },
  'arduino-nano': {
    id: 'arduino-nano',
    name: 'Arduino Nano',
    fqbn: 'arduino:avr:nano',
  },
  'arduino-mega': {
    id: 'arduino-mega',
    name: 'Arduino Mega 2560',
    fqbn: 'arduino:avr:mega',
  },
};

export function isSupportedBoard(value: unknown): value is BoardId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BOARD_SPECS, value);
}
