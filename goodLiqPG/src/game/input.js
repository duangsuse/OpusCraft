// Keyboard / mouse state with per-tick edge detection and pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // pressed since last consume (tick)
    this.framePressed = new Set();// pressed since last frame
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.locked = false;
    this.handlers = [];           // UI key handlers: fn(e) -> true if consumed
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      for (const h of this.handlers) if (h(e)) { e.preventDefault(); return; }
      if (['Tab', 'F1', 'F2', 'F3', 'F5', 'F7', 'F11', 'Space', 'ArrowUp', 'ArrowDown', 'Slash', 'Quote', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD', 'KeyA', 'KeyQ', 'KeyF', 'KeyR'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) { this.pressed.add(e.code); this.framePressed.add(e.code); }
      this.keys.add(e.code);
    }, { capture: true });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.buttons |= 1 << e.button;
      this.mousePressed.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse.buttons &= ~(1 << e.button); this.mouseReleased.add(e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.locked) { this.mouse.wheel += Math.sign(e.deltaY); } }, { passive: true });
  }
  lock() { if (!this.locked) { const p = this.canvas.requestPointerLock({ unadjustedMovement: false }); if (p && p.catch) p.catch(() => { }); } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  consumePressed(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  consumeFramePressed(code) { if (this.framePressed.has(code)) { this.framePressed.delete(code); return true; } return false; }
  button(b) { return (this.mouse.buttons >> b) & 1; }
  consumeMouse(b) { if (this.mousePressed.has(b)) { this.mousePressed.delete(b); return true; } return false; }
  takeMouseDelta() { const d = [this.mouse.dx, this.mouse.dy]; this.mouse.dx = 0; this.mouse.dy = 0; return d; }
  takeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }
  endTick() { this.pressed.clear(); this.mousePressed.clear(); this.mouseReleased.clear(); }
  endFrame() { this.framePressed.clear(); }
  clear() { this.keys.clear(); this.pressed.clear(); this.framePressed.clear(); this.mouse.buttons = 0; this.mousePressed.clear(); }
}
