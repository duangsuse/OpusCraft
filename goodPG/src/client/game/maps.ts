// Dibujo de los mapas (fase 5): cada píxel es la columna de un bloque, con el color medio de la cara
// de arriba del bloque más alto (la hierba y las hojas teñidas con el color del bioma) y sombreado
// como en Minecraft según la altura del vecino del norte. Lo cargado se lee del mundo; lo que no,
// del generador (sin árboles). El dibujo se hace poco a poco para no parar el juego.
import { BLOCK_RENDER, BLOCK_TEX, BLOCK_FLUID, R_NONE, R_CROSS, R_CROP, AIR, WATER } from '../../shared/blocks';
import { TEXTURE_DEFS } from '../../shared/textureDefs';
import { MIN_Y, SEA_LEVEL, CHUNK_SIZE, blockIndex } from '../../shared/constants';
import { MAP_SIZE, mapOrigin } from '../../shared/maps';
import { TerrainGenerator, type ColumnInfo } from '../../shared/world/terrain';
import type { GeneratedTextures } from '../textures/generateTextures';
import type { World } from '../world/World';

/** Color medio (sRGB) de cada capa de textura y si se tiñe con el bioma. */
let layerColor: Uint8Array | null = null;
let layerTint: Uint8Array | null = null;

/** Calcula los colores medios de las texturas (una vez, al arrancar). */
export function setMapPalette(tex: GeneratedTextures): void {
  const n = tex.count;
  layerColor = new Uint8Array(n * 3);
  layerTint = new Uint8Array(n);
  const px = tex.size * tex.size;
  for (let l = 0; l < n; l++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let i = 0; i < px; i++) {
      const o = (l * px + i) * 4;
      if (tex.albedo[o + 3] < 128) continue;
      r += tex.albedo[o];
      g += tex.albedo[o + 1];
      b += tex.albedo[o + 2];
      c++;
    }
    c = Math.max(1, c);
    layerColor.set([r / c, g / c, b / c], l * 3);
    const t = TEXTURE_DEFS[l]?.tint ?? 0;
    layerTint[l] = t === 1 || t === 3 ? 1 : 0;
  }
}

const WATER_RGB: [number, number, number] = [52, 92, 196];
const tmpInfo: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
const tmpGrass = [0, 0, 0];
const tmpLayers = [0, 0, 0, 0];

/** Imagen de un mapa que se va completando. */
export class MapImage {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  /** Altura y bloque de las columnas que salen del generador (no cargadas), para no recalcularlas. */
  private genTop = new Int16Array(MAP_SIZE * MAP_SIZE).fill(-32768);
  private genId = new Uint16Array(MAP_SIZE * MAP_SIZE);
  private tops = new Int16Array(MAP_SIZE * MAP_SIZE);
  private ids = new Uint16Array(MAP_SIZE * MAP_SIZE);
  private depth = new Uint8Array(MAP_SIZE * MAP_SIZE);
  private row = 0;
  readonly x0: number;
  readonly z0: number;
  /** Veces que se ha completado el dibujo entero. */
  passes = 0;

  /**
   * `area`: zona propia del mapa (su esquina y su escala en bloques por píxel): la de un mapa de estructura
   * (fase 7.5) o la de un mapa ampliado (fase 7.6). `explorer`: el estilo de Minecraft de los mapas de
   * estructura para lo que aún no se ha visto (tierra anaranjada y agua a rayas).
   */
  readonly scale: number;
  readonly explorer: boolean;

  constructor(readonly key: number, area?: { x0: number; z0: number; scale: number }, explorer = !!area) {
    [this.x0, this.z0] = area ? [area.x0, area.z0] : mapOrigin(key);
    this.scale = area?.scale ?? 1;
    this.explorer = explorer;
    this.canvas.width = MAP_SIZE;
    this.canvas.height = MAP_SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(MAP_SIZE, MAP_SIZE);
    // Pergamino de fondo mientras se dibuja.
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) this.img.data.set([214, 196, 156, 255], i * 4);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Dibuja filas hasta gastar `budgetMs` milisegundos. */
  step(world: World, budgetMs: number): void {
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      this.drawRow(world, this.row);
      this.row++;
      if (this.row >= MAP_SIZE) {
        this.row = 0;
        this.passes++;
        break;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  private drawRow(world: World, r: number): void {
    const gen = world.generator;
    const sc = this.scale, half = sc >> 1; // Fase 7.5 (mansión): mapas a escala
    const z = this.z0 + r * sc + half;
    for (let c = 0; c < MAP_SIZE; c++) {
      const x = this.x0 + c * sc + half;
      const i = r * MAP_SIZE + c;
      let top = MIN_Y, id = AIR, depth = 0;
      const col = world.getColumn(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
      if (col && col.blocks) {
        const lx = x - col.cx * CHUNK_SIZE, lz = z - col.cz * CHUNK_SIZE;
        let y = Math.min(col.maxY + 1, 319);
        for (; y > MIN_Y; y--) {
          const b = col.blocks[blockIndex(lx, y, lz)];
          if (b === AIR) continue;
          const rd = BLOCK_RENDER[b];
          if (rd === R_NONE || rd === R_CROSS || rd === R_CROP) continue;
          break;
        }
        top = y;
        id = col.blocks[blockIndex(lx, y, lz)];
        if (BLOCK_FLUID[id] === 1) {
          while (depth < 12 && BLOCK_FLUID[col.blocks[blockIndex(lx, y - depth - 1, lz)]] === 1) depth++;
        }
      } else {
        if (this.genTop[i] === -32768) {
          const inf = gen.columnInfo(x, z, tmpInfo);
          const h = gen.surfaceAt(x, z, inf);
          if (h < SEA_LEVEL - 1) {
            this.genTop[i] = SEA_LEVEL - 1;
            this.genId[i] = WATER;
            this.depth[i] = Math.min(12, SEA_LEVEL - 1 - h);
          } else {
            this.genTop[i] = h;
            this.genId[i] = gen.surfaceRules(x, z, inf.biome, h, 0, tmpLayers)[0];
          }
        }
        top = this.genTop[i];
        id = this.genId[i];
        depth = this.depth[i];
      }
      this.tops[i] = top;
      this.ids[i] = id;
      this.depth[i] = depth;
      if (this.explorer && !(col && col.blocks)) this.paintExplorer(c, i, r); // Fase 7.5 (mansión)
      else this.paint(gen, x, z, i, r);
    }
  }

  /** Fase 7.5 (mansión): lo no visitado de un mapa de estructura: tierra anaranjada con relieve y agua a rayas. */
  private paintExplorer(c: number, i: number, r: number): void {
    const water = BLOCK_FLUID[this.ids[i]] === 1;
    let rgb: [number, number, number];
    if (water) {
      const deep = this.depth[i] > 3;
      rgb = deep && (c + r) % 2 === 0 ? [92, 124, 196] : [118, 150, 214];
    } else {
      const north = r > 0 ? this.tops[i - MAP_SIZE] : this.tops[i];
      const k = this.tops[i] > north ? 1.08 : this.tops[i] < north ? 0.86 : 0.97;
      rgb = [214 * k, 152 * k, 94 * k];
      // Costa: más oscura junto al agua de la fila de arriba.
      if (r > 0 && BLOCK_FLUID[this.ids[i - MAP_SIZE]] === 1) rgb = [150, 100, 60];
    }
    const d = this.img.data;
    d[i * 4] = Math.min(255, rgb[0]);
    d[i * 4 + 1] = Math.min(255, rgb[1]);
    d[i * 4 + 2] = Math.min(255, rgb[2]);
    d[i * 4 + 3] = 255;
  }

  private paint(gen: TerrainGenerator, x: number, z: number, i: number, r: number): void {
    const id = this.ids[i];
    let rgb: [number, number, number];
    let shade = 1;
    if (BLOCK_FLUID[id] === 1) {
      rgb = WATER_RGB;
      shade = 1.05 - Math.min(12, this.depth[i]) * 0.035 - ((x + z) & 1 && this.depth[i] > 4 ? 0.04 : 0);
    } else {
      const layer = BLOCK_TEX[id * 6 + 2];
      const lc = layerColor, lt = layerTint;
      rgb = lc ? [lc[layer * 3], lc[layer * 3 + 1], lc[layer * 3 + 2]] : [128, 128, 128];
      if (lt && lt[layer]) {
        TerrainGenerator.biomeGrass(gen.columnInfo(x, z, tmpInfo), tmpGrass);
        rgb = [(rgb[0] * tmpGrass[0]) / 255, (rgb[1] * tmpGrass[1]) / 255, (rgb[2] * tmpGrass[2]) / 255];
      }
      // Relieve: más claro si sube respecto al norte, más oscuro si baja.
      const north = r > 0 ? this.tops[i - MAP_SIZE] : this.tops[i];
      shade = this.tops[i] > north ? 1.12 : this.tops[i] < north ? 0.8 : 0.94;
    }
    const d = this.img.data;
    d[i * 4] = Math.min(255, rgb[0] * shade);
    d[i * 4 + 1] = Math.min(255, rgb[1] * shade);
    d[i * 4 + 2] = Math.min(255, rgb[2] * shade);
    d[i * 4 + 3] = 255;
  }
}

