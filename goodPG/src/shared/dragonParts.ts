// Fase 8.6 (el End): dónde van las partes del dragón respecto a su posición (EnderDragon.aiStep: tickPart). Lo usan
// el servidor (golpes, contacto, bloques que rompe) y el cliente (a qué parte se apunta).
import { DRAGON_PARTS } from './endMobs';

const DEG = Math.PI / 180;
const wrapDeg = (a: number) => {
  let d = a % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

/**
 * Desplazamientos [dx, dy, dz] (del centro de la base de cada parte) en el orden de DRAGON_PARTS. `yRot` en grados de
 * Java (el dragón mira hacia (sin, −cos)); `lat(n)`, el [yRot, y] de hace n ticks; `sitting`, posado.
 */
export function dragonPartOffsets(yRot: number, yRotA: number, lat: (step: number) => [number, number], sitting: boolean): [number, number, number][] {
  const out: [number, number, number][] = DRAGON_PARTS.map(() => [0, 0, 0]);
  const yAngle = (lat(5)[1] - lat(10)[1]) * 10 * DEG;
  const cc = Math.cos(yAngle), ss = Math.sin(yAngle);
  const rot = yRot * DEG, rs = Math.sin(rot), rc = Math.cos(rot);
  out[2] = [rs * 0.5, 0, -rc * 0.5];
  out[6] = [rc * 4.5, 2, rs * 4.5];
  out[7] = [rc * -4.5, 2, rs * -4.5];
  const r1 = Math.sin(rot - yRotA * 0.01), r2 = Math.cos(rot - yRotA * 0.01);
  const yOff = sitting ? -1 : lat(5)[1] - lat(0)[1];
  out[0] = [r1 * 6.5 * cc, yOff + ss * 6.5, -r2 * 6.5 * cc];
  out[1] = [r1 * 5.5 * cc, yOff + ss * 5.5, -r2 * 5.5 * cc];
  const p1 = lat(5);
  for (let i = 0; i < 3; i++) {
    const p0 = lat(12 + i * 2);
    const rot2 = rot + wrapDeg(p0[0] - p1[0]) * DEG;
    const ss2 = Math.sin(rot2), cc2 = Math.cos(rot2);
    const dd = (i + 1) * 2;
    out[3 + i] = [-(rs * 1.5 + ss2 * dd) * cc, p0[1] - p1[1] - (dd + 1.5) * ss + 1.5, (rc * 1.5 + cc2 * dd) * cc];
  }
  return out;
}
