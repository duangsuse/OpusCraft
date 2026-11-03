// Fase 7 (redstone): punto de entrada de la redstone compartida. Importarlo registra el comportamiento
// de todos los componentes (components.ts) y de los raíles (rails.ts). Ver docs/redstone.md.
import './components';
import './rails';

export * from './api';
export * from './signals';
export * from './wire';
export * from './use';
export { containerSignal, noteInstrument, INSTRUMENTS, arrowOnButton, updateRodBase } from './components';
