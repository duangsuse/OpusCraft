// rgl/biome-caustic.js —— 到海边自动把水底焦散切成 Ocean（waterCaustic = 3），离开后改回进海边之前的值。
//   用 gm.on({ biome }) 订阅（index.html 的 gm）；进海边期间用户手动改了焦散档就不再覆盖（视为用户接管）。
const SEA = new Set(['ocean', 'deep_ocean', 'beach']), OCEAN = 3;
export function install(gm, vr) {
  let saved = null;
  return gm.on({
    biome(key) {
      const P = vr.P;
      if (SEA.has(key)) { if (saved === null && P.waterCaustic !== OCEAN) { saved = P.waterCaustic; P.waterCaustic = OCEAN; } }
      else if (saved !== null) { if (P.waterCaustic === OCEAN) P.waterCaustic = saved; saved = null; }
    },
  });
}
