// Conexión con el servidor de multijugador (WebSocket) y reloj compartido.
import { MULTI } from '../config.js';

export function connect() {
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${host}:${MULTI.PORT}`);
  const handlers = new Map();
  let offset = 0; // hora del servidor - hora local (ms)
  let best = Infinity; // mejor ida y vuelta medida (para ajustar el reloj)
  let pingTimer = null;
  const api = {
    id: null,
    get open() {
      return ws.readyState === 1;
    },
    on(type, fn) {
      handlers.set(type, fn);
    },
    send(msg) {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    },
    /** Hora del servidor (ms), igual para todos los jugadores. */
    now() {
      return Date.now() + offset;
    },
    close() {
      clearInterval(pingTimer);
      ws.close();
    },
  };
  const emit = (t, m) => handlers.get(t)?.(m);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'hola') {
      api.id = m.id;
      offset = m.serverNow - Date.now();
      ping();
      pingTimer = setInterval(ping, 2000);
    } else if (m.t === 'pong') {
      const rtt = Date.now() - m.c;
      if (rtt < best + 5) {
        best = Math.min(best, rtt);
        offset = m.serverNow + rtt / 2 - Date.now();
      }
      return;
    }
    emit(m.t, m);
  };
  ws.onopen = () => emit('abierto');
  ws.onclose = () => {
    clearInterval(pingTimer);
    emit('cerrado');
  };
  ws.onerror = () => emit('error');
  function ping() {
    api.send({ t: 'ping', c: Date.now() });
  }
  return api;
}
