// Fase 8.5 (lo que da el Nether): la pantalla del faro (BeaconScreen) dentro de la pantalla de inventario: los
// poderes principales por nivel de la pirámide (Velocidad y Prisa; Resistencia y Supersalto; Fuerza), el
// secundario con el nivel 4 (Regeneración o el principal en nivel II), el hueco del pago y confirmar. Los botones
// de los niveles que la pirámide no alcanza están apagados; confirmar gasta el pago y avisa al servidor.
import './beacon.css';
import type { ItemStack } from '../../shared/items';
import { BEACON_EFFECTS, BEACON_PAYMENT, validPrimary, validSecondary } from '../../shared/beacon';
import { EFFECTS, EFFECT_REGENERATION } from '../../shared/effects';
import { effectIcon } from './effectsHud';
import type { WorkHost, WorkPanel } from './enchantScreens';

const PAY = 0;

export class BeaconPanel implements WorkPanel {
  private primary = 0;
  private secondary = 0;
  private loaded = false;

  constructor(private host: WorkHost, private pos: [number, number, number]) {}

  html(): string {
    const btn = (kind: 'p' | 's', id: number, label = '') =>
      `<button type="button" class="bcn-fx" data-work="${kind}:${id}" data-tip="${EFFECTS[id].name}${label ? ' ' + label : ''}">` +
      `<i style="background-image:url(${effectIcon(id)})"></i>${label ? `<b>${label}</b>` : ''}</button>`;
    const tiers = BEACON_EFFECTS.slice(0, 3).map((list, i) =>
      `<div class="bcn-tier" data-tier="${i + 1}"><span class="bcn-pyr">${'▲'.repeat(i + 1)}</span>${list.map((id) => btn('p', id)).join('')}</div>`).join('');
    return '<h3>Faro</h3><div class="bcn">' +
      `<div class="bcn-col"><p class="bcn-title">Poder principal</p>${tiers}</div>` +
      `<div class="bcn-col"><p class="bcn-title">Poder secundario</p><div class="bcn-tier" data-tier="4"><span class="bcn-pyr">▲▲▲▲</span>` +
      `${btn('s', EFFECT_REGENERATION)}<span class="bcn-second"></span></div></div>` +
      '<div class="bcn-pay"><div class="bcn-coins"></div>' +
      `<div class="slot2" data-s="grid:${PAY}" data-hint="Pago"></div>` +
      '<button type="button" class="bcn-ok" data-work="ok" data-tip="Confirmar">✔</button></div></div>';
  }

  accepts(i: number, s: ItemStack): number {
    return i === PAY && BEACON_PAYMENT.has(s.id) ? 1 : 0;
  }

  result(): ItemStack | null {
    return null;
  }

  take(): boolean {
    return false;
  }

  private level(): number {
    return this.host.beaconLevel(this.pos);
  }

  render(panel: HTMLElement, grid: readonly (ItemStack | null)[], icons: Map<number, string>): void {
    if (!this.loaded) {
      [this.primary, this.secondary] = this.host.beaconEffects(this.pos);
      this.loaded = true;
    }
    const level = this.level();
    for (const t of panel.querySelectorAll<HTMLElement>('.bcn-tier')) t.classList.toggle('off', Number(t.dataset.tier) > level);
    // El secundario «II» es el principal elegido.
    const second = panel.querySelector('.bcn-second') as HTMLElement | null;
    if (second) {
      const id = this.primary;
      const key = id ? `s:${id}` : '';
      if (second.dataset.key !== key) {
        second.dataset.key = key;
        second.innerHTML = id
          ? `<button type="button" class="bcn-fx" data-work="s:${id}" data-tip="${EFFECTS[id].name} II"><i style="background-image:url(${effectIcon(id)})"></i><b>II</b></button>`
          : '';
      }
    }
    for (const b of panel.querySelectorAll<HTMLElement>('.bcn-fx')) {
      const [kind, raw] = (b.dataset.work ?? '').split(':');
      const id = Number(raw);
      const ok = kind === 'p' ? validPrimary(id, level) : validSecondary(id, this.primary, level);
      b.classList.toggle('dis', !ok);
      b.classList.toggle('sel', kind === 'p' ? id === this.primary : id === this.secondary);
    }
    const coins = panel.querySelector('.bcn-coins') as HTMLElement | null;
    if (coins && !coins.dataset.done) {
      coins.dataset.done = '1';
      coins.innerHTML = [...BEACON_PAYMENT].map((id) => `<i style="background-image:url(${icons.get(id) ?? ''})"></i>`).join('');
    }
    panel.querySelector('.bcn-ok')?.classList.toggle('dis', !this.canConfirm(grid));
  }

  private canConfirm(grid: readonly (ItemStack | null)[]): boolean {
    return !!grid[PAY] && validPrimary(this.primary, this.level());
  }

  click(target: HTMLElement, grid: (ItemStack | null)[]): boolean {
    const el = target.closest('[data-work]') as HTMLElement | null;
    const w = el?.dataset.work;
    if (!w) return false;
    if (w === 'ok') {
      if (!this.canConfirm(grid)) return true;
      const pay = grid[PAY]!;
      grid[PAY] = pay.count > 1 ? { ...pay, count: pay.count - 1 } : null;
      const level = this.level();
      this.host.beaconSet(this.pos, this.primary, validSecondary(this.secondary, this.primary, level) ? this.secondary : 0);
      this.host.sound('click');
      return true;
    }
    const [kind, raw] = w.split(':');
    const id = Number(raw);
    const level = this.level();
    if (kind === 'p' && validPrimary(id, level)) {
      this.primary = id;
      if (this.secondary && !validSecondary(this.secondary, id, level)) this.secondary = 0;
    } else if (kind === 's' && validSecondary(id, this.primary, level)) this.secondary = id;
    else return true;
    this.host.sound('click');
    return true;
  }
}
