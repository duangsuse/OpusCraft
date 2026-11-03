// Experiencia del jugador (la gestiona el cliente, como el inventario): total acumulado, nivel y
// progreso hacia el siguiente con las fórmulas de shared/experience.ts.
import { levelFromTotal } from '../../shared/experience';

export class Experience {
  private _total = 0;
  /** Aumenta con cada cambio (para guardar y refrescar el HUD). */
  version = 0;
  private cached = -1;
  private lv = 0;
  private prog = 0;

  /** Experiencia total acumulada. */
  get total(): number {
    return this._total;
  }

  set total(v: number) {
    this._total = Math.max(0, Math.floor(v) || 0);
    this.version++;
  }

  get level(): number {
    this.refresh();
    return this.lv;
  }

  /** Progreso hacia el siguiente nivel (0..1). */
  get progress(): number {
    this.refresh();
    return this.prog;
  }

  /** Suma `n` puntos; devuelve true si se subió de nivel. */
  add(n: number): boolean {
    if (!(n > 0)) return false;
    const before = this.level;
    this.total = this._total + n;
    return this.level > before;
  }

  reset(): void {
    this.total = 0;
  }

  private refresh(): void {
    if (this.cached === this.version) return;
    const r = levelFromTotal(this._total);
    this.lv = r.level;
    this.prog = r.progress;
    this.cached = this.version;
  }
}
