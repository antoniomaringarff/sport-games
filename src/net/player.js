// Quién juega (sin login): un id que se genera una vez y queda en el navegador, y el nombre.
// También manda los tiempos al servidor (/api, en Vercel) y trae el ranking.
const ID_KEY = 'sport-games:jugador-id';
const NAME_KEY = 'sport-games:nombre';

function read(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

/** Nombre válido: entre 2 y 16 letras, sin espacios de más. null si no sirve. */
export function cleanName(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 16 ? s : null;
}

export function playerId() {
  let id = read(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    write(ID_KEY, id);
  }
  return id;
}

export function playerName() {
  return cleanName(read(NAME_KEY));
}

/** Guarda el nombre y avisa al servidor (que anota IP y ciudad). Devuelve el nombre o null. */
export async function setPlayerName(name) {
  const n = cleanName(name);
  if (!n) return null;
  write(NAME_KEY, n);
  await registerPlayer();
  return n;
}

/** Alta o visita del jugador. Sin servidor (npm run dev) no pasa nada. */
export async function registerPlayer() {
  const name = playerName();
  if (!name) return;
  try {
    await fetch('/api/player', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: playerId(), name }),
    });
  } catch {}
}

const ONLINE_PLACES = ['monaco', 'rally', 'condor'];

/** Manda una vuelta (Mónaco) o una etapa (rally). time y sectors en segundos. */
export function submitRecord({ place, car, time, sectors }) {
  const name = playerName();
  if (!name || !ONLINE_PLACES.includes(place)) return;
  delete rankingCache[place];
  fetch('/api/records', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: playerId(), name, place, car, time, sectors }),
    keepalive: true,
  }).catch(() => {});
}

const rankingCache = {}; // lugar -> { at, top }

/** Los 10 mejores de un lugar: [{ name, car, time }]. null si no hay servidor. */
export async function topRecords(place) {
  if (!ONLINE_PLACES.includes(place)) return null;
  const c = rankingCache[place];
  if (c && performance.now() - c.at < 20000) return c.top;
  try {
    const res = await fetch(`/api/records?place=${place}`);
    if (!res.ok) return null;
    const { top } = await res.json();
    rankingCache[place] = { at: performance.now(), top };
    return top;
  } catch {
    return null;
  }
}
