// Editor de carteles: un tablero de madera con cuatro líneas. Se abre al colocar un cartel o al hacer
// clic derecho en uno; Intro pasa de línea (en la última, termina) y Esc también termina (guardando).
import './signEditor.css';
import { SIGN_LINES, SIGN_LINE_MAX } from '../../shared/signText';

export class SignEditor {
  private root: HTMLElement;
  private inputs: HTMLInputElement[] = [];
  private pos: [number, number, number] | null = null;

  /** `onDone` recibe la posición y las líneas al cerrar. */
  constructor(private onDone: (pos: [number, number, number], lines: string[]) => void) {
    this.root = document.createElement('div');
    this.root.id = 'sign-editor';
    this.root.className = 'hidden';
    this.root.innerHTML = '<div class="sign-board"></div><button type="button">Listo</button>' +
      '<p>Intro: siguiente línea · Esc o Listo: terminar</p>';
    const board = this.root.querySelector('.sign-board')!;
    for (let i = 0; i < SIGN_LINES; i++) {
      const inp = document.createElement('input');
      inp.maxLength = SIGN_LINE_MAX;
      inp.spellcheck = false;
      inp.autocomplete = 'off';
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i < SIGN_LINES - 1) this.inputs[i + 1].focus();
          else this.close();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
      inp.addEventListener('keyup', (e) => e.stopPropagation());
      board.appendChild(inp);
      this.inputs.push(inp);
    }
    this.root.querySelector('button')!.addEventListener('click', () => this.close());
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.pos !== null;
  }

  open(pos: [number, number, number], lines: readonly string[]): void {
    this.pos = pos;
    this.inputs.forEach((inp, i) => (inp.value = lines[i] ?? ''));
    this.root.classList.remove('hidden');
    setTimeout(() => this.inputs[0].focus(), 0);
  }

  close(): void {
    const pos = this.pos;
    if (!pos) return;
    this.pos = null;
    this.root.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    this.onDone(pos, this.inputs.map((i) => i.value));
  }
}
