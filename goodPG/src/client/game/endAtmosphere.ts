// Fase 8.6 (el End): el ambiente del End en el cliente. Los destellos del cielo (shared/endFlash.ts, con el tiempo
// del servidor: todos los ven a la vez), su trueno lejano a los 1,5 s de empezar y, por encima de Java, motas de
// polvo violeta que flotan despacio en el vacío alrededor del jugador y se encienden con el destello.
import { DIM_END } from '../../shared/dimensions';
import { endFlashAt, END_FLASH_SOUND_DELAY } from '../../shared/endFlash';
import type { Game } from './Game';

export class EndAtmosphere {
  /** Destello para el renderizador: [dirección, intensidad] (null fuera del End). */
  flash: [number, number, number, number] | null = null;
  private lastSince = -1;
  private motes = 0;

  constructor(private g: Game) {}

  update(dt: number): void {
    const g = this.g;
    if (g.world?.dim !== DIM_END) {
      this.flash = null;
      return;
    }
    const ticks = (Date.now() + (g.net?.serverOffset ?? 0)) / 50;
    const f = endFlashAt(ticks);
    this.flash = [f.dir[0], f.dir[1], f.dir[2], f.intensity];
    if (f.sinceStart >= END_FLASH_SOUND_DELAY && this.lastSince < END_FLASH_SOUND_DELAY && this.lastSince >= 0) {
      const p = g.player;
      g.audio.playEnchantSfx('end_flash', [p.x + f.dir[0] * 40, p.eyeY + f.dir[1] * 40, p.z + f.dir[2] * 40]);
    }
    this.lastSince = f.sinceStart;
    // Polvo del vacío: unas cuantas motas por segundo alrededor.
    this.motes += dt * (6 + f.intensity * 20);
    const fx = g.renderer.entities.pfx;
    const p = g.player;
    while (this.motes >= 1) {
      this.motes -= 1;
      const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 14;
      fx.endMote(p.x + Math.cos(a) * d, p.eyeY + (Math.random() - 0.4) * 10, p.z + Math.sin(a) * d, f.intensity);
    }
  }
}
