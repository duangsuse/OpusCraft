// Teclas configurables: qué tecla hace cada acción (se guardan con los ajustes) y cómo se llaman en
// pantalla. Las ranuras 1–9, Esc y F1/F3 no se cambian.

export type KeyAction =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint'
  | 'inventory' | 'drop' | 'swapHands' | 'chat' | 'command' | 'playerList' | 'perspective' | 'voice' | 'whisper';

export type Keybinds = Record<KeyAction, string>;

/** [acción, nombre, tecla por defecto], en el orden en que se muestran. */
export const KEY_ACTIONS: readonly [KeyAction, string, string][] = [
  ['forward', '前进', 'KeyW'],
  ['back', '后退', 'KeyS'],
  ['left', '向左', 'KeyA'],
  ['right', '向右', 'KeyD'],
  ['jump', '跳跃', 'Space'],
  ['sneak', '潜行', 'ShiftLeft'],
  ['sprint', '疾跑', 'ControlLeft'],
  ['inventory', '物品栏', 'KeyE'],
  ['drop', '丢弃物品', 'KeyQ'],
  ['swapHands', '交换副手', 'KeyF'],
  ['chat', '聊天', 'KeyT'],
  ['command', '命令', 'Slash'],
  ['playerList', '玩家列表', 'Tab'],
  ['perspective', '切换视角', 'F5'],
  ['voice', '说话（语音聊天）', 'KeyV'],
  ['whisper', '耳语（语音聊天）', 'KeyB'],
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
  Space: '空格', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  AltLeft: '左 Alt', AltRight: '右 Alt', Tab: 'Tab', Enter: '回车', Backspace: '退格', CapsLock: '大写锁定',
  Slash: '/', Minus: '-', Period: '.', Comma: ',', Semicolon: ';', Quote: '\'', BracketLeft: '[', BracketRight: ']',
  Backquote: '`', Backslash: '\\', IntlBackslash: '<', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

/** Nombre corto de una tecla (código de KeyboardEvent.code). */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return '小键盘 ' + code.slice(6);
  return code;
}
