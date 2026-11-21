// Ranking online del lugar elegido en el menú (los 10 mejores, un tiempo por jugador).
import { CARS } from '../../config.js';
import { topRecords, playerName } from '../../net/player.js';

const TITLES = { monaco: 'Récords de Mónaco (vuelta)', rally: 'Récords Tête de Chien', condor: 'Récords El Cóndor' };

const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createRanking() {
  const root = document.getElementById('ranking');
  let current = null;

  async function show(place) {
    current = place;
    if (!TITLES[place]) {
      root.hidden = true;
      return;
    }
    const top = await topRecords(place);
    if (current !== place) return; // cambió de lugar mientras cargaba
    if (!top) {
      root.hidden = true; // sin servidor (npm run dev)
      return;
    }
    const me = playerName();
    root.innerHTML = `<h2>🏆 ${TITLES[place]}</h2>${
      top.length
        ? `<ol>${top
            .map(
              (r) =>
                `<li class="${r.name === me ? 'me' : ''}"><b>${esc(r.name)}</b><span>${esc(CARS[r.car]?.name ?? r.car)}</span><em>${fmt(r.time)}</em></li>`,
            )
            .join('')}</ol>`
        : '<p>Todavía no hay tiempos. ¡Marcá el primero!</p>'
    }`;
    root.hidden = false;
  }

  return { show };
}
