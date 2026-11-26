// Billetera: las monedas que juntaste y los autos que compraste en la tienda.
// Se guarda en este navegador (localStorage).
import { CARS, MAPA } from '../../config.js';

const COINS_KEY = 'sport-games:monedas';
const GARAGE_KEY = 'sport-games:garage';

const read = (k, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

let coins = read(COINS_KEY, MAPA.START_COINS);
const garage = new Set(read(GARAGE_KEY, []));
const listeners = new Set();
const changed = (gain = 0) => {
  write(COINS_KEY, coins);
  write(GARAGE_KEY, [...garage]);
  for (const fn of listeners) fn(coins, gain);
};

export const wallet = {
  get coins() {
    return coins;
  },
  /** Los autos sin precio vienen de regalo; los de la tienda hay que comprarlos. */
  owns(id) {
    return !!CARS[id] && (!CARS[id].price || garage.has(id));
  },
  add(n) {
    if (!n) return;
    coins += n;
    changed(n);
  },
  /** Comprar un auto: true si alcanzó la plata. */
  buy(id) {
    const price = CARS[id]?.price ?? 0;
    if (this.owns(id) || coins < price) return false;
    coins -= price;
    garage.add(id);
    changed(-price);
    return true;
  },
  /** fn(monedas, cuánto cambió) cada vez que cambia algo. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Autos que se pueden manejar (en el orden del menú). */
export const ownedIds = (ids) => ids.filter((id) => wallet.owns(id));
