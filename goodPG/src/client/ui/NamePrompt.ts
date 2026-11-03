// Fase 6.5 (remate): ventana para escribir el nombre de una etiqueta al ponérsela a una criatura (en
// Minecraft se escribe en el yunque). Intro acepta y Esc cancela.
import './namePrompt.css';

export class NamePrompt {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private done: ((name: string | null) => void) | null = null;

  constructor(max: number) {
    this.root = document.createElement('div');
    this.root.id = 'name-prompt';
    this.root.className = 'hidden';
    this.root.innerHTML = '<div class="panel"><h3>给它起个名字</h3><input type="text" spellcheck="false" autocomplete="off">' +
      '<div class="row"><button type="button" class="btn" data-k="no">取消</button>' +
      '<button type="button" class="btn primary" data-k="ok">设置名字</button></div>' +
      '<p>Enter：确定 · Esc：取消。命名牌会被消耗。</p></div>';
    this.input = this.root.querySelector('input')!;
    this.input.maxLength = max;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close(false);
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.querySelector('[data-k="ok"]')!.addEventListener('click', () => this.close(true));
    this.root.querySelector('[data-k="no"]')!.addEventListener('click', () => this.close(false));
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.done !== null;
  }

  open(current: string, done: (name: string | null) => void): void {
    this.done = done;
    this.input.value = current;
    this.root.classList.remove('hidden');
    setTimeout(() => {
      this.input.focus();
      this.input.select();
    }, 0);
  }

  close(accept: boolean): void {
    const done = this.done;
    if (!done) return;
    this.done = null;
    this.root.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    const name = this.input.value.trim();
    done(accept && name ? name : null);
  }
}
