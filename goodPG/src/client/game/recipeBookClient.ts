// Fase 9 (libro de recetas): qué recetas tiene desbloqueadas el jugador. Se desbloquean al tener en la mochila el
// ingrediente principal (ver shared/recipeBook.ts) y se guardan con el resto del jugador (PlayerSave.rb, sólo se
// manda cuando cambia). En creativo están todas a la vista. Lo que ya llevaba al entrar se desbloquea sin aviso.
import { ITEMS } from '../../shared/items';
import { recipesFor, type BookRecipe } from '../../shared/recipeBook';
import type { PlayerSave } from '../../shared/protocol';
import type { Game } from './Game';

export class RecipeBookState {
  private unlocked = new Set<number>();
  /** Cambia con cada receta nueva (para refrescar el libro y guardar). */
  version = 0;
  private sent = 0;
  private seen = -1;
  /** El primer repaso tras cargar no avisa. */
  private quiet = true;

  constructor(private g: Game) {}

  restore(save: PlayerSave | null): void {
    this.unlocked = new Set(save?.rb ?? []);
    this.version++;
    this.sent = this.version;
    this.seen = -1;
    this.quiet = true;
  }

  /** Lo que se guarda, sólo si cambió desde la última vez que se mandó. */
  toWire(): { rb?: number[] } {
    if (this.sent === this.version) return {};
    this.sent = this.version;
    return { rb: [...this.unlocked] };
  }

  has(r: BookRecipe): boolean {
    return this.g.creative || this.unlocked.has(r.key);
  }

  /** Repasa lo que lleva encima y desbloquea; avisa de lo nuevo (una vez cada vez que cambia la mochila). */
  update(): void {
    const inv = this.g.inv;
    if (inv.version === this.seen) return;
    this.seen = inv.version;
    const ids = new Set<number>();
    for (const s of [...inv.slots, ...inv.armor, inv.offhand, inv.cursor]) if (s) ids.add(s.id);
    const fresh = recipesFor(ids).filter((r) => !this.unlocked.has(r.key));
    if (!fresh.length) {
      this.quiet = false;
      return;
    }
    for (const r of fresh) this.unlocked.add(r.key);
    this.version++;
    if (!this.quiet) {
      const names = [...new Set(fresh.map((r) => r.out.id))];
      this.g.ui.toast(names.length === 1 ? `Receta nueva: ${ITEMS[names[0]].name}` : `${names.length} recetas nuevas en el libro`);
    }
    this.quiet = false;
  }
}
