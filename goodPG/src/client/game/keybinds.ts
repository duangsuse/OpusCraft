// Teclas configurables: qué tecla hace cada acción (se guardan con los ajustes) y cómo se llaman en
// pantalla. Las ranuras 1–9, Esc y F1/F3 no se cambian.

export type KeyAction =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint'
  | 'inventory' | 'drop' | 'swapHands' | 'chat' | 'command' | 'playerList' | 'perspective' | 'voice' | 'whisper';

export type Keybinds = Record<KeyAction, string>;

/** [acción, nombre, tecla por defecto], en el orden en que se muestran. */
export const KEY_ACTIONS: readonly [KeyAction, string, string][] = [
  ['forward', 'Avanzar', 'KeyW'],
  ['back', 'Retroceder', 'KeyS'],
  ['left', 'Izquierda', 'KeyA'],
  ['right', 'Derecha', 'KeyD'],
  ['jump', 'Saltar', 'Space'],
  ['sneak', 'Agacharse', 'ShiftLeft'],
  ['sprint', 'Correr', 'ControlLeft'],
  ['inventory', 'Inventario', 'KeyE'],
  ['drop', 'Tirar objeto', 'KeyQ'],
  ['swapHands', 'Cambiar de mano', 'KeyF'],
  ['chat', 'Chat', 'KeyT'],
  ['command', 'Comando', 'Slash'],
  ['playerList', 'Lista de jugadores', 'Tab'],
  ['perspective', 'Cambiar cámara', 'F5'],
  ['voice', 'Hablar (chat de voz)', 'KeyV'],
  ['whisper', 'Susurrar (chat de voz)', 'KeyB'],
];

/** Teclas que no se pueden asignar (las usa el juego para otra cosa). */
const RESERVED = new Set(['Escape', 'F1', 'F3', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);

export function defaultKeybinds(): Keybinds {
  return Object.fromEntries(KEY_ACTIONS.map(([a, , k]) => [a, k])) as Keybinds;
}

/** Completa y limpia lo guardado (teclas nuevas por defecto, nada reservado). */
export function sanitizeKeybinds(raw: unknown): Keybinds {
  const out = defaultKeybinds();
  if (raw && typeof raw === 'object') {
    for (const [a] of KEY_ACTIONS) {
      const v = (raw as Record<string, unknown>)[a];
      if (typeof v === 'string' && v.length > 0 && v.length < 32 && !RESERVED.has(v)) out[a] = v;
    }
  }
  return out;
}

/**
 * Asigna `code` a `action`. Si otra acción la tenía, se queda con la tecla anterior de ésta (se
 * intercambian). Devuelve false si la tecla está reservada.
 */
export function assignKey(keys: Keybinds, action: KeyAction, code: string): boolean {
  if (RESERVED.has(code)) return false;
  const prev = keys[action];
  for (const [a] of KEY_ACTIONS) if (a !== action && keys[a] === code) keys[a] = prev;
  keys[action] = code;
  return true;
}

const NAMES: Record<string, string> = {
  Space: 'Espacio', ShiftLeft: 'Mayús izq.', ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
  AltLeft: 'Alt izq.', AltRight: 'Alt der.', Tab: 'Tab', Enter: 'Intro', Backspace: 'Retroceso', CapsLock: 'Bloq Mayús',
  Slash: '/', Minus: '-', Period: '.', Comma: ',', Semicolon: 'Ñ', Quote: '´', BracketLeft: '`', BracketRight: '+',
  Backquote: 'º', Backslash: 'Ç', IntlBackslash: '<', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

/** Nombre corto de una tecla (código de KeyboardEvent.code). */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  return code;
}
