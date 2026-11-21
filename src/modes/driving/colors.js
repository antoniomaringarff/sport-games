// Color de cada auto: el que elegiste (se recuerda por auto) o uno al azar que dura toda la sesión.
import { COLORS, RANDOM_COLORS } from '../../config.js';

const key = (car) => `sport-games:color:${car}`;
const sessionColor = new Map(); // auto -> color al azar de esta sesión

export function randomColor(avoid = []) {
  const pool = RANDOM_COLORS.filter((c) => !avoid.includes(c));
  const list = pool.length ? pool : RANDOM_COLORS;
  return list[Math.floor(Math.random() * list.length)];
}

/** El color que eligió el jugador para ese auto, o null si lo deja al azar. */
export function savedColor(car) {
  try {
    const v = localStorage.getItem(key(car));
    return COLORS[v] ? v : null;
  } catch {
    return null;
  }
}

/** Color con el que sale el auto ahora. */
export function carColor(car) {
  const saved = savedColor(car);
  if (saved) return saved;
  if (!sessionColor.has(car)) sessionColor.set(car, randomColor());
  return sessionColor.get(car);
}

/** Elegir un color para el auto (null = volver al azar, con uno nuevo). */
export function chooseColor(car, color) {
  try {
    if (color && COLORS[color]) localStorage.setItem(key(car), color);
    else {
      localStorage.removeItem(key(car));
      sessionColor.set(car, randomColor([sessionColor.get(car)]));
    }
  } catch {}
}

/**
 * Para una carrera puntual: si el color que tocaría ya lo usa otro con el mismo auto,
 * se usa otro al azar sin tocar lo que elegiste.
 */
export function colorAvoiding(car, taken) {
  const c = carColor(car);
  return taken.includes(c) ? randomColor(taken) : c;
}
