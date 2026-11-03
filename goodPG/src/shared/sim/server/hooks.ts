// Puntos de enganche entre sistemas, en lugar de funciones que se envuelven unas a otras (cada sistema
// guardaba la anterior y la llamaba: el orden dependía de la línea en que se enganchaba y era fácil
// perder un eslabón). Los sistemas exponen uno de éstos y los demás se apuntan con add().

/** Suceso con varios oyentes: se avisa a todos, en el orden en que se apuntaron. */
export class Listeners<A extends unknown[]> {
  private fns: ((...args: A) => void)[] = [];

  add(fn: (...args: A) => void): void {
    this.fns.push(fn);
  }

  emit(...args: A): void {
    for (const fn of this.fns) fn(...args);
  }
}

/**
 * Manejadores que se prueban en orden hasta que uno atiende el caso (devuelve algo distinto de null,
 * undefined o false). El primero que se apunta tiene prioridad.
 */
export class Handlers<A extends unknown[], R> {
  private fns: ((...args: A) => R | null | undefined | false)[] = [];

  add(fn: (...args: A) => R | null | undefined | false): void {
    this.fns.push(fn);
  }

  first(...args: A): R | null {
    for (const fn of this.fns) {
      const r = fn(...args);
      if (r !== null && r !== undefined && r !== false) return r;
    }
    return null;
  }
}
