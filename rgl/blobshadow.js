// rgl/blobshadow.js —— 实体脚下的圆形软影（CPU 摆放，一个贴花四边形每实体，不采样阴影图）。
// depthWrite 必须开：方案 A 的合并 pass 靠 entRT 的深度判定像素有没有实体（深度 = 1 视为空），透明不写深度的影子会被整个丢掉。
// 实体由 three 在 final 之后画，进不了 goodGL 的阴影图；这个只给「站在地上」的感觉：半径随碰撞体宽，离地越高越淡越大，
// 浓度跟天空光（洞里、夜里几乎没有）和直射光强度走。casters() 给 [{ x, y, z, r, sky }]（脚下世界坐标 + 半径 + 所在格天空光 0..15）；groundY(x, y, z) 给脚下地面的世界 y（没有则 null）。
export function createBlobShadows(THREE, scene, { casters, groundY, getF, max = 48, strength = () => 0.38 }) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const pool = [];
  const mk = () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
    m.renderOrder = -1; m.visible = false; m.frustumCulled = false; scene.add(m); pool.push(m); return m;
  };
  return {
    update() {
      const F = getF(), list = F ? casters() : [];
      const sun = F ? Math.min(1, Math.max(0, F.lightDir[1] * 3)) * Math.min(1, (F.lightCol[0] + F.lightCol[1] + F.lightCol[2]) / 2.5) : 0;
      let n = 0;
      for (const e of list) {
        if (n >= max) break;
        const gy = groundY(e.x, e.y, e.z); if (gy == null) continue;
        const h = Math.max(0, e.y - gy), fade = 1 / (1 + h * 0.9);
        const a = strength() * fade * Math.pow(e.sky / 15, 2) * (0.25 + 0.75 * sun);           // 夜里 / 洞里留 25%：环境遮蔽的暗斑
        if (a < 0.02) continue;
        const m = pool[n] || mk(); n++;
        const s = e.r * 2.8 * (1 + h * 0.25);
        m.position.set(e.x, gy + 0.03, e.z); m.scale.set(s, 1, s); m.material.opacity = a; m.visible = true;
      }
      for (let i = n; i < pool.length; i++) pool[i].visible = false;
    },
    dispose() { for (const m of pool) { scene.remove(m); m.material.dispose(); } pool.length = 0; geo.dispose(); tex.dispose(); },
  };
}
