// Asistente del chat: al escribir un comando se abre una ventanita encima de la línea con las
// sugerencias (comandos con su descripción, o las opciones del argumento que toca: objetos con su
// icono, criaturas, efectos, estructuras, jugadores…) y la firma del comando con el argumento actual
// resaltado. ↑/↓ recorren la lista, Tab (o → al final de la línea) acepta, Enter acepta si se ha
// elegido con las flechas y Esc la cierra. Un texto fantasma en gris adelanta lo que falta de la
// sugerencia elegida. Sin la ventanita, ↑/↓ recorren el historial de lo enviado.
import './chatAssist.css';
import { COMMAND_SPECS, findCommand, norm, type CommandSpec, type Option } from './commandSpec';

const HISTORY_KEY = 'voxelcraft:chat-history';
const HISTORY_MAX = 50;
/** Sugerencias como mucho (la lista se desplaza). */
const MAX_OPTIONS = 60;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Parte de la línea bajo el cursor: [inicio, fin] de la palabra, índice (0 = el comando) y la palabra. */
interface Token {
  start: number;
  end: number;
  index: number;
  word: string;
}

/** Puntuación de una opción para lo escrito (menor = mejor; -1 = no encaja). */
function score(o: Option, w: string): number {
  if (!w) return 5;
  const v = norm(o.value), l = o.label ? norm(o.label) : '';
  if (v.startsWith(w)) return v === w ? 0 : 1;
  if (l.startsWith(w)) return 2;
  if (l.split(/[\s_]+/).some((p) => p.startsWith(w)) || v.split('_').some((p) => p.startsWith(w))) return 3;
  if (v.includes(w)) return 4;
  if (l.includes(w)) return 5;
  return -1;
}

export class ChatCompletion {
  private history: string[] = [];
  private pos = -1;
  private draft = '';
  private box: HTMLDivElement;
  private sig: HTMLDivElement;
  private list: HTMLDivElement;
  private ghost: HTMLDivElement;
  private options: Option[] = [];
  private sel = 0;
  /** Se ha movido la selección con las flechas (Enter acepta en vez de enviar). */
  private navigated = false;
  /** Cerrada con Esc hasta que se vuelva a escribir. */
  private dismissed = false;
  private token: Token | null = null;
  private cmd: CommandSpec | undefined;

  constructor(private input: HTMLInputElement, private players: () => string[], private icons: () => Map<number, string>) {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) this.history = (JSON.parse(raw) as unknown[]).filter((s): s is string => typeof s === 'string').slice(-HISTORY_MAX);
    } catch {
      /* sin historial guardado */
    }
    // Ventanita encima de la línea y texto fantasma sobre ella.
    this.box = document.createElement('div');
    this.box.id = 'chat-assist';
    this.box.className = 'hidden';
    this.sig = document.createElement('div');
    this.sig.className = 'sig';
    this.list = document.createElement('div');
    this.list.className = 'list';
    this.box.append(this.list, this.sig);
    const line = document.createElement('div');
    line.className = 'chat-line';
    this.ghost = document.createElement('div');
    this.ghost.id = 'chat-ghost';
    input.parentElement!.insertBefore(this.box, input);
    input.parentElement!.replaceChild(line, input);
    line.append(input, this.ghost);
    input.addEventListener('input', () => {
      this.pos = -1;
      this.dismissed = false;
      this.navigated = false;
      this.refresh();
    });
    input.addEventListener('click', () => this.refresh());
    input.addEventListener('blur', () => this.hide());
    this.list.addEventListener('mousedown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
      if (!row) return;
      e.preventDefault();
      this.sel = Number(row.dataset.i);
      this.accept();
    });
  }

  /** Lo enviado se añade al historial (sin repetir el último). */
  sent(line: string): void {
    if (this.history[this.history.length - 1] !== line) this.history.push(line);
    if (this.history.length > HISTORY_MAX) this.history.shift();
    this.pos = -1;
    this.hide();
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      /* no se guarda */
    }
  }

  /** Teclas del campo del chat; devuelve true si la ha usado. */
  onKey(e: KeyboardEvent): boolean {
    const open = this.isOpen();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (open && this.options.length > 0) {
        const n = this.options.length;
        this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        this.navigated = true;
        this.render();
        return true;
      }
      this.historyStep(e.key === 'ArrowUp');
      return true;
    }
    if (e.key === 'Tab') {
      if (open && this.options.length > 0) {
        if (e.shiftKey) {
          this.sel = (this.sel + this.options.length - 1) % this.options.length;
          this.navigated = true;
          this.render();
        } else this.accept();
      }
      return true;
    }
    if (e.key === 'Enter' && open && this.navigated && this.options.length > 0) {
      this.accept();
      return true;
    }
    if (e.key === 'ArrowRight' && open && this.options.length > 0 && this.input.selectionStart === this.input.value.length && this.ghost.textContent) {
      this.accept();
      return true;
    }
    if (e.key === 'Escape' && open) {
      this.dismissed = true;
      this.hide();
      return true;
    }
    return false;
  }

  /** Vuelve a calcular las sugerencias (al abrir el chat con texto, p. ej. «/»). */
  refresh(): void {
    const v = this.input.value;
    if (!v.startsWith('/') || this.dismissed) {
      this.hide();
      return;
    }
    const caret = this.input.selectionStart ?? v.length;
    this.token = this.tokenAt(v, caret);
    const parts = v.slice(1).split(/\s+/);
    this.cmd = findCommand(parts[0] ?? '');
    const t = this.token;
    const w = norm(t.word);
    let pool: Option[] = [];
    if (t.index === 0) {
      // Comandos (también por sus alias).
      pool = COMMAND_SPECS.map((c) => ({ value: c.name, label: c.desc, alias: c.aliases }))
        .map((o) => ({ ...o, s: Math.min(...[o.value, ...(o.alias ?? [])].map((a) => score({ value: a, label: o.label }, w)).map((s) => (s < 0 ? 99 : s))) }))
        .filter((o) => o.s < 99)
        .sort((a, b) => a.s - b.s || a.value.localeCompare(b.value))
        .map(({ value, label }) => ({ value, label }));
    } else if (this.cmd) {
      const arg = this.cmd.args[t.index - 1];
      if (arg?.options) {
        pool = arg.options(this.players())
          .map((o) => ({ o, s: score(o, w) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => a.s - b.s || a.o.value.length - b.o.value.length || a.o.value.localeCompare(b.o.value))
          .slice(0, MAX_OPTIONS)
          .map((x) => x.o);
      }
    }
    // Si lo escrito ya es exactamente la única opción, no hace falta la lista.
    if (pool.length === 1 && norm(pool[0].value) === w) pool = [];
    this.options = pool;
    if (this.sel >= pool.length || !this.navigated) this.sel = 0;
    this.render();
  }

  // ------------------------------------------------------------------ interno

  private isOpen(): boolean {
    return !this.box.classList.contains('hidden');
  }

  private hide(): void {
    this.box.classList.add('hidden');
    this.ghost.textContent = '';
  }

  private historyStep(up: boolean): void {
    if (this.history.length === 0) return;
    if (this.pos === -1) this.draft = this.input.value;
    this.pos = up ? (this.pos === -1 ? this.history.length - 1 : Math.max(0, this.pos - 1)) : this.pos === -1 ? -1 : this.pos + 1;
    if (this.pos >= this.history.length) this.pos = -1;
    this.set(this.pos === -1 ? this.draft : this.history[this.pos]);
    this.refresh();
  }

  private set(v: string, caret = v.length): void {
    this.input.value = v;
    this.input.setSelectionRange(caret, caret);
  }

  private tokenAt(v: string, caret: number): Token {
    let start = caret;
    while (start > 0 && v[start - 1] !== ' ') start--;
    let end = caret;
    while (end < v.length && v[end] !== ' ') end++;
    const before = v.slice(1, start).trim();
    const index = before ? before.split(/\s+/).length : 0;
    const s = index === 0 ? Math.max(1, start) : start;
    return { start: s, end, index, word: v.slice(s, caret) };
  }

  /** Escribe la opción elegida en lugar de la palabra bajo el cursor. */
  private accept(): void {
    const o = this.options[this.sel];
    const t = this.token;
    if (!o || !t) return;
    const v = this.input.value;
    let more: boolean;
    if (t.index === 0) more = (findCommand(o.value)?.args.length ?? 0) > 0;
    else more = !!this.cmd && t.index < this.cmd.args.length;
    const after = v.slice(t.end).replace(/^\s*/, '');
    const insert = o.value + (more || after ? ' ' : '');
    const nv = v.slice(0, t.start) + insert + after;
    this.set(nv, t.start + insert.length);
    this.navigated = false;
    this.refresh();
  }

  private render(): void {
    const t = this.token;
    if (!t) return this.hide();
    // Firma del comando con el argumento actual resaltado, y qué es ese argumento.
    let sigHtml = '';
    if (this.cmd) {
      const c = this.cmd;
      const parts = [`<span class="${t.index === 0 ? 'cur' : 'cmd'}">/${esc(c.name)}</span>`];
      c.args.forEach((a, i) => parts.push(`<span class="${t.index === i + 1 ? 'cur' : 'arg'}">${a.optional ? '[' : '&lt;'}${esc(a.name)}${a.optional ? ']' : '&gt;'}</span>`));
      const arg = t.index > 0 ? c.args[t.index - 1] : undefined;
      const help = t.index === 0 ? c.desc : arg ? arg.desc : c.args.length ? 'Sobran argumentos' : 'Este comando no lleva argumentos';
      sigHtml = `<div class="line">${parts.join(' ')}</div><div class="help${!arg && t.index > 0 ? ' warn' : ''}">${esc(help)}</div>`;
    } else if (t.index > 0) {
      sigHtml = `<div class="help warn">Comando desconocido: escribe /ayuda</div>`;
    } else if (this.options.length > 0) {
      sigHtml = `<div class="kbd-hints"><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Tab</kbd> completar · <kbd>Esc</kbd> cerrar</div>`;
    }
    this.sig.innerHTML = sigHtml;
    this.sig.classList.toggle('hidden', !sigHtml);
    // Lista.
    const w = norm(t.word);
    this.list.innerHTML = this.options.map((o, i) => {
      const v = o.value;
      const k = norm(v).startsWith(w) ? w.length : 0;
      const val = `<b>${esc(v.slice(0, k))}</b>${esc(v.slice(k))}`;
      const icon = o.item !== undefined ? `<i class="ico" style="background-image:url(${this.icons().get(o.item) ?? ''})"></i>` : '';
      const prefix = t.index === 0 ? '/' : '';
      return `<div class="row${i === this.sel ? ' sel' : ''}" data-i="${i}">${icon}<span class="val">${prefix}${val}</span>${o.label ? `<span class="det">${esc(o.label)}</span>` : ''}</div>`;
    }).join('');
    this.list.classList.toggle('hidden', this.options.length === 0);
    const selRow = this.list.children[this.sel] as HTMLElement | undefined;
    selRow?.scrollIntoView({ block: 'nearest' });
    const show = this.options.length > 0 || !!sigHtml;
    this.box.classList.toggle('hidden', !show);
    // Texto fantasma: lo que falta de la opción elegida (con el cursor al final).
    const o = this.options[this.sel];
    const v = this.input.value;
    const atEnd = (this.input.selectionStart ?? 0) === v.length && t.end === v.length;
    if (o && atEnd && norm(o.value).startsWith(w) && o.value.length > t.word.length && this.input.scrollWidth <= this.input.clientWidth) {
      this.ghost.innerHTML = `<span class="typed">${esc(v)}</span><span class="rest">${esc(o.value.slice(t.word.length))}</span>`;
    } else this.ghost.textContent = '';
  }
}
