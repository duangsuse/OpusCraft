// Entrada: teclado, ratón (con pointer lock) y rueda.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Teclas pulsadas en este frame con Ctrl mantenido (Ctrl+Q tira la pila entera). */
  private pressedCtrl = new Set<string>();
  private lastPress = new Map<string, number>();
  private doubleTapped = new Set<string>();
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  /** Cuando es false (chat/inventario abiertos) las teclas de juego se ignoran. */
  gameKeys = true;
  /** Teclas asignadas a acciones (el navegador no debe usarlas mientras se juega). */
  reserved = new Set<string>();
  /** Teclas de movimiento (Ctrl + tecla tampoco debe cerrar la pestaña, p. ej. Ctrl+W). */
  movement = new Set<string>();
  onLockChange: ((locked: boolean) => void) | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  requestLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    const anyCanvas = this.canvas as HTMLCanvasElement & {
      requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      const r = anyCanvas.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => {
          try {
            const r2 = anyCanvas.requestPointerLock();
            if (r2 && typeof (r2 as Promise<void>).catch === 'function') (r2 as Promise<void>).catch(() => {});
          } catch {
            /* sin pointer lock */
          }
        });
      }
    } catch {
      try {
        anyCanvas.requestPointerLock();
      } catch {
        /* sin pointer lock */
      }
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Teclado bloqueado (pantalla completa): Ctrl+W y compañía llegan al juego, no al navegador. */
  keyboardLocked = false;

  /**
   * Pantalla completa con bloqueo de teclado (Chrome y Edge). Así correr con Ctrl + W no cierra la
   * pestaña. Fuera de pantalla completa los navegadores no dejan bloquear Ctrl+W.
   */
  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (e) {
      console.warn('Pantalla completa no disponible', e);
    }
  }

  private onFullscreenChange = () => {
    const kb = (navigator as Navigator & { keyboard?: { lock(keys?: string[]): Promise<void>; unlock(): void } }).keyboard;
    if (!kb) return;
    if (document.fullscreenElement) {
      kb.lock().then(() => (this.keyboardLocked = true)).catch(() => (this.keyboardLocked = false));
    } else {
      kb.unlock();
      this.keyboardLocked = false;
    }
  };

  isDown(code: string): boolean {
    return this.gameKeys && this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Pulsada en este frame mientras se mantenía Ctrl. */
  wasPressedWithCtrl(code: string): boolean {
    return this.pressedCtrl.has(code);
  }

  /** Doble pulsación de una tecla (dentro de 300 ms) en este frame. */
  wasDoubleTapped(code: string): boolean {
    return this.doubleTapped.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.pressedCtrl.clear();
    this.doubleTapped.clear();
    this.mousePressed = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  releaseAll(): void {
    this.down.clear();
    this.mouseDown = [false, false, false];
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (typing && e.code !== 'Escape' && e.code !== 'Enter') return;
    if (!e.repeat) {
      this.pressed.add(e.code);
      if (e.ctrlKey || e.metaKey) this.pressedCtrl.add(e.code);
      const now = performance.now();
      const last = this.lastPress.get(e.code) ?? -1e9;
      if (now - last < 300) {
        this.doubleTapped.add(e.code);
        this.lastPress.set(e.code, -1e9);
      } else {
        this.lastPress.set(e.code, now);
      }
    }
    this.down.add(e.code);
    // Con el teclado bloqueado, Esc llega al juego en vez de soltar el ratón: lo soltamos nosotros
    // (y así se abre la pausa). Mantener Esc sigue saliendo de la pantalla completa.
    if (e.code === 'Escape' && this.keyboardLocked && this.locked) this.exitLock();
    // Evita acciones del navegador en las teclas del juego.
    if (this.locked && (this.reserved.has(e.code) || ['Tab', 'F1', 'F2', 'F3', 'F5', 'Space'].includes(e.code))) e.preventDefault();
    if (this.locked && (e.ctrlKey || e.metaKey) && (this.movement.has(e.code) || e.code === 'KeyW')) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private onBlur = () => {
    this.releaseAll();
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) this.releaseAll();
    this.onLockChange?.(this.locked);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button < 3) {
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    }
    e.preventDefault();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button < 3) this.mouseDown[e.button] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    // Filtra picos espurios que algunos navegadores emiten al capturar el ratón.
    if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };
}
