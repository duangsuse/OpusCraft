// Mapa y brújula en pantalla (fase 5). Con un mapa en la mano principal se ve el mapa entero,
// con una flecha para el jugador y puntos para los demás; con una brújula en cualquier mano, una
// esfera cuya aguja apunta al punto de aparición del mundo.
import { COMPASS, FILLED_MAP } from '../../shared/items';
import { LODESTONE, familyBase } from '../../shared/blocks'; // Fase 8.5
import { MAP_SIZE } from '../../shared/maps';
import { MapImage } from './maps';
import { structureMapOf } from '../../shared/structureMaps'; // Fase 7.5 (océano)
import { structureMapArea } from '../../shared/structureMapData'; // Fase 7.5 (mansión): escala y estilo
import { mapZoom, mapLocked, mapArea } from '../../shared/mapOps'; // Fase 7.6: mapas ampliados y bloqueados
import { structureMarkIcon } from './explorerMarks';
import type { Game } from './Game';
import '../ui/navigation.css';
import { updateRecoveryCompass } from './recoveryCompass'; // Fase 7.5 (abismo)
import { dimensionDef } from '../../shared/dimensions'; // Fase 8 (dimensiones)

export class Navigation {
  private mapEl: HTMLDivElement | null = null;
  private compassEl: HTMLDivElement | null = null;
  private needle: HTMLDivElement | null = null;
  private images = new Map<number | string, MapImage>();
  private shown: MapImage | null = null;

  constructor(private g: Game) {}

  update(): void {
    const g = this.g;
    const main = g.heldStack;
    const off = g.inv.offhand;
    const mapKey = main?.id === FILLED_MAP && main.dmg ? main.dmg : 0;
    const compass = main?.id === COMPASS ? main : off?.id === COMPASS ? off : null;
    this.updateMap(mapKey);
    this.updateCompass(!!compass && !mapKey, compass?.data?.lode ?? null);
    updateRecoveryCompass(g, !!mapKey); // Fase 7.5 (abismo)
  }

  /**
   * Imagen de un mapa (se crea al verlo por primera vez y se sigue completando). Fase 7.5 (mansión): los
   * mapas de estructura (tesoro y explorador) tienen su propia zona y escala y el estilo de exploración.
   */
  imageOf(key: number, area?: { x0: number; z0: number; scale: number }, explorer = !!area, locked = false): MapImage {
    // Fase 7.6: el bloqueado deja de refrescarse, así que no comparte imagen con el que no lo está.
    const id = `${area ? `${area.scale}:${area.x0},${area.z0}` : key}${explorer ? 'e' : ''}${locked ? 'L' : ''}`;
    let img = this.images.get(id);
    if (!img) {
      img = new MapImage(key, area, explorer);
      this.images.set(id, img);
      if (this.images.size > 12) this.images.delete(this.images.keys().next().value!);
    }
    return img;
  }

  private updateMap(key: number): void {
    const g = this.g;
    if (!key || !g.world) {
      if (this.mapEl) this.mapEl.style.display = 'none';
      this.shown = null;
      return;
    }
    if (!this.mapEl) {
      this.mapEl = document.createElement('div');
      this.mapEl.id = 'map-view';
      document.body.appendChild(this.mapEl);
    }
    // Fase 7.5 (mansión): un mapa de estructura se dibuja a su escala, centrado en la celda del objetivo.
    // Fase 7.6: un mapa ampliado se dibuja a su escala; uno bloqueado, una vez dibujado, ya no cambia.
    const target = structureMapOf(g.heldStack);
    const zoom = mapZoom(g.heldStack), locked = mapLocked(g.heldStack);
    const img = target ? this.imageOf(key, structureMapArea(target.kind, target.x, target.z), true, locked)
      : this.imageOf(key, zoom ? mapArea(key, zoom) : undefined, false, locked);
    // Unos milisegundos por fotograma: se dibuja entero en menos de un segundo y luego se refresca.
    if (!locked || img.passes === 0) img.step(g.world, img.passes === 0 ? 6 : 1.5);
    const el = this.mapEl;
    el.style.display = 'block';
    if (this.shown !== img) {
      el.innerHTML = '';
      img.canvas.className = 'map-canvas';
      el.appendChild(img.canvas);
      this.shown = img;
    }
    // Marcas: el jugador (flecha) y los demás (puntos de su color), en fracciones del mapa.
    for (const m of el.querySelectorAll('.map-mark')) m.remove();
    const mark = (x: number, z: number, cls: string, yaw: number | null, color?: string) => {
      let u = (x - img.x0) / (MAP_SIZE * img.scale), v = (z - img.z0) / (MAP_SIZE * img.scale);
      const outside = u < 0 || u > 1 || v < 0 || v > 1;
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
      const m = document.createElement('div');
      m.className = `map-mark ${cls}${outside ? ' outside' : ''}`;
      m.style.left = `${u * 100}%`;
      m.style.top = `${v * 100}%`;
      if (yaw !== null && !outside) m.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
      if (color) m.style.background = color;
      el.appendChild(m);
    };
    // Fase 7.5 (océano, mansión): el objetivo de un mapa del tesoro o de explorador, con su marca pintada a mano
    // (X roja, monumento o mansión).
    if (target) {
      mark(target.x + 0.5, target.z + 0.5, `target ${target.def.marker}`, null);
      (el.lastElementChild as HTMLElement).style.backgroundImage = `url(${structureMarkIcon(target.def.marker)})`;
    }
    for (const rp of g.remote.values()) mark(rp.view.x, rp.view.z, 'other', null, rp.shirt);
    mark(g.player.x, g.player.z, 'me', g.player.yaw);
  }

  /** Fase 8.5: `lode`, la magnetita de una brújula magnetizada [x, y, z, dimensión]. */
  private updateCompass(show: boolean, lode: readonly number[] | null = null): void {
    const g = this.g;
    if (!show) {
      if (this.compassEl) this.compassEl.style.display = 'none';
      return;
    }
    if (!this.compassEl) {
      this.compassEl = document.createElement('div');
      this.compassEl.id = 'compass-view';
      this.compassEl.innerHTML = '<span class="n">N</span><div class="needle"></div>';
      this.needle = this.compassEl.querySelector('.needle');
      document.body.appendChild(this.compassEl);
    }
    this.compassEl.style.display = 'block';
    // Ángulo del punto de aparición respecto a donde mira el jugador (0 = de frente, horario). Fase 8.5: la
    // magnetizada apunta a su magnetita, en su dimensión y si sigue ahí (si no, gira sin rumbo).
    const p = g.player;
    const dim = g.world?.dim ?? 0;
    const lodeBlock = lode && lode[3] === dim ? g.world?.getBlock(lode[0], lode[1], lode[2]) ?? -1 : -1;
    const lodeOk = !!lode && lode[3] === dim && (lodeBlock < 0 || familyBase(lodeBlock) === LODESTONE);
    const tx = lode ? lode[0] + 0.5 : g.spawn[0], tz = lode ? lode[2] + 0.5 : g.spawn[2];
    const dx = tx - p.x, dz = tz - p.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    // Muy cerca del punto (o en el Nether, fase 8) la aguja gira sin rumbo, como en Minecraft.
    const near = Math.hypot(dx, dz) < 2 || (lode ? !lodeOk : !dimensionDef(dim).compass);
    const a = near ? performance.now() / 180 : Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    this.needle!.style.transform = `translate(-50%, -100%) rotate(${a}rad)`;
    // La "N" de la esfera marca el norte (−z) respecto a la vista.
    const n = this.compassEl.querySelector('.n') as HTMLElement;
    const an = Math.atan2(-rz, -fz);
    n.style.transform = `translate(-50%, -50%) rotate(${an}rad) translateY(-26px) rotate(${-an}rad)`;
  }
}
