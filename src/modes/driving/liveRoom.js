// Aviso en el menú: si hay una carrera multijugador por arrancar, se muestra quiénes están y
// cuánto falta, con un botón para sumarse rápido (con el auto que eligió el primero que entró).
import { CARS } from '../../config.js';
import { roomStatus } from '../../net/net.js';

const POLL_MS = 3000;
const MAX_POLL_MS = 60000; // sin servidor se pregunta cada vez menos, para no llenar la consola de errores
const TITLE = document.title;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** onJoin(status): se llama al tocar "Sumarme" (o J). */
export function createLiveRoom({ onJoin }) {
  const root = document.getElementById('live');
  let running = false;
  let timer = null;
  let tick = null;
  let wait = POLL_MS;
  let status = null;
  let offset = 0; // hora del servidor - hora local

  const open = () => status?.phase === 'espera' && status.players.length > 0 && status.players.length < status.max;
  const secondsLeft = () => (status?.endsAt ? Math.max(0, Math.ceil((status.endsAt - (Date.now() + offset)) / 1000)) : null);

  function render() {
    const left = secondsLeft();
    if (!open() || left === 0) {
      root.hidden = true;
      document.title = TITLE;
      return;
    }
    const host = status.players[0];
    const n = status.players.length;
    const wasHidden = root.hidden;
    root.innerHTML = `
      <div class="live-dot"></div>
      <div class="live-text">
        <b>Carrera multijugador por arrancar</b>
        <span>${n} jugador${n > 1 ? 'es' : ''} esperando: ${status.players.map((p) => esc(p.name)).join(', ')}</span>
        <span>Larga en <b>${left} s</b> · auto: <b>${esc(CARS[host.car]?.name ?? host.car)}</b> (lo eligió ${esc(host.name)})</span>
      </div>
      <button type="button" data-join>Sumarme <kbd>J</kbd></button>`;
    root.querySelector('[data-join]').addEventListener('click', join);
    root.hidden = false;
    if (wasHidden) {
      root.classList.remove('pop');
      void root.offsetWidth; // reiniciar la animación
      root.classList.add('pop');
    }
    document.title = `🏁 Larga en ${left} s · ${TITLE}`;
  }

  async function poll() {
    const s = await roomStatus();
    if (!running) return; // ya se cerró el menú
    status = s;
    if (s) offset = s.serverNow - Date.now();
    render();
    wait = s ? POLL_MS : Math.min(wait * 2, MAX_POLL_MS);
    timer = setTimeout(poll, wait);
  }

  function join() {
    if (open() && secondsLeft() > 0) onJoin(status);
  }

  return {
    start() {
      if (running) return;
      running = true;
      wait = POLL_MS;
      tick = setInterval(render, 500);
      poll();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      clearInterval(tick);
      timer = tick = null;
      root.hidden = true;
      document.title = TITLE;
    },
    join,
  };
}
