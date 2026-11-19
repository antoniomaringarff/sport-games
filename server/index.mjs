// Servidor de multijugador (red local por ahora).
//
//   npm run server
//
// Una sola sala ("Mónaco"). El primero que entra arranca la cuenta de 15 s; se pueden sumar
// hasta MAX_PLAYERS. Al terminar la cuenta se completa con bots hasta GRID_SIZE, se arma la
// grilla y se manda la hora exacta de la largada. Cada jugador simula su propio auto y manda
// su posición; el servidor la reenvía a los demás. Los bots los maneja el anfitrión (el
// primero de la lista) y los manda como si fueran jugadores.
import { WebSocketServer } from 'ws';
import os from 'node:os';
import { MULTI, CARS } from '../src/config.js';

// Para probar rápido: LAPS=1 LOBBY=5 npm run server
if (process.env.LAPS) MULTI.LAPS = Number(process.env.LAPS);
if (process.env.LOBBY) MULTI.LOBBY_SECONDS = Number(process.env.LOBBY);

const wss = new WebSocketServer({ port: MULTI.PORT, host: '0.0.0.0' });

const BOT_NAMES = ['Bot Turbo', 'Bot Rayo', 'Bot Pistón', 'Bot Nitro', 'Bot Chispa', 'Bot Trueno', 'Bot Cometa', 'Bot Bólido', 'Bot Zeta'];
const CAR_IDS = Object.keys(CARS);

let nextId = 1;
const players = new Map(); // id -> { id, ws, name, car }
let room = newRoom();

function newRoom() {
  return {
    phase: 'espera', // espera → carrera → resultados
    endsAt: null,    // fin de la cuenta de la sala (ms)
    grid: [],        // [{ id, name, car, bot, slot }]
    goAt: null,      // hora de la largada (ms)
    finish: new Map(), // id -> tiempo total
    prog: new Map(),   // id -> metros recorridos (para ordenar a los que no llegaron)
    firstFinishAt: null,
    timer: null,
  };
}

const now = () => Date.now();
function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg, except = null) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(data);
}
function joined() {
  return [...players.values()].filter((p) => p.joined).sort((a, b) => a.id - b.id);
}
function hostId() {
  // el anfitrión es el jugador más antiguo que sigue conectado
  return joined()[0]?.id ?? null;
}
function lobbyInfo() {
  return {
    t: 'sala',
    phase: room.phase,
    players: joined().map(({ id, name, car }) => ({ id, name, car })),
    endsAt: room.endsAt,
    host: hostId(),
    max: MULTI.MAX_PLAYERS,
    grid: MULTI.GRID_SIZE,
    serverNow: now(),
  };
}

function startCountdown() {
  if (room.endsAt) return;
  room.endsAt = now() + MULTI.LOBBY_SECONDS * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(startRace, MULTI.LOBBY_SECONDS * 1000);
}

function startRace() {
  clearTimeout(room.timer);
  const humans = joined().slice(0, MULTI.MAX_PLAYERS);
  if (!humans.length) {
    room = newRoom();
    return;
  }
  const grid = humans.map((p, i) => ({ id: p.id, name: p.name, car: p.car, bot: false, slot: i }));
  const fill = Math.min(MULTI.MAX_PLAYERS, Math.max(MULTI.GRID_SIZE, humans.length));
  for (let i = grid.length, b = 0; i < fill; i++, b++) {
    grid.push({ id: 1000 + b, name: BOT_NAMES[b % BOT_NAMES.length], car: CAR_IDS[b % CAR_IDS.length], bot: true, slot: i });
  }
  room.phase = 'carrera';
  room.grid = grid;
  room.finish = new Map();
  room.firstFinishAt = null;
  // luces: arrancan en 1,5 s; 5 luces de 0,8 s y un rato al azar
  room.goAt = now() + 1500 + 4000 + 400 + Math.round(Math.random() * 1200);
  broadcast({ t: 'largada', grid, goAt: room.goAt, lightsAt: room.goAt - 4400, laps: MULTI.LAPS, host: hostId(), serverNow: now() });
  console.log(`🏁 Largada: ${humans.length} jugador(es) + ${grid.length - humans.length} bot(s)`);
}

function checkEnd() {
  if (room.phase !== 'carrera') return;
  const humanIds = room.grid.filter((g) => !g.bot && players.has(g.id)).map((g) => g.id);
  const allHumansDone = humanIds.every((id) => room.finish.has(id));
  const timeUp = room.firstFinishAt && now() - room.firstFinishAt > MULTI.RESULTS_WAIT * 1000;
  if (allHumansDone || timeUp || humanIds.length === 0) endRace();
}

function endRace() {
  const results = room.grid
    .map((g) => ({ ...g, time: room.finish.get(g.id) ?? null, prog: room.prog.get(g.id) ?? 0 }))
    .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || b.prog - a.prog);
  broadcast({ t: 'resultados', results });
  console.log('🏆 Resultados:', results.map((r) => `${r.name} ${r.time?.toFixed(2) ?? 'NT'}`).join(' · '));
  room = newRoom();
  // para la próxima carrera cada uno vuelve a entrar (Enter en la pantalla de resultados)
  for (const pl of players.values()) pl.joined = false;
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const p = { id, ws, name: `Jugador ${id}`, car: 'f1', joined: false };
  players.set(id, p);
  send(ws, { t: 'hola', id, serverNow: now() });

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.t) {
      case 'entrar': // entrar a la sala con nombre y auto
        p.name = String(m.name ?? p.name).slice(0, 16) || p.name;
        p.car = CARS[m.car] ? m.car : 'f1';
        p.joined = true;
        if (room.phase === 'espera') {
          startCountdown();
          if (joined().length >= MULTI.MAX_PLAYERS) startRace();
          else broadcast(lobbyInfo());
        } else {
          send(ws, lobbyInfo()); // carrera en curso: espera la próxima
        }
        break;
      case 'nombre':
        p.name = String(m.name ?? '').slice(0, 16) || p.name;
        if (room.phase === 'espera') broadcast(lobbyInfo());
        break;
      case 'estado': {
        // posición de un auto: el propio, o un bot si lo manda el anfitrión
        const who = m.id ?? id;
        if (who !== id && !(who >= 1000 && id === hostId())) return;
        if (typeof m.prog === 'number') room.prog.set(who, m.prog);
        broadcast({ t: 'estado', id: who, s: m.s, time: m.time, prog: m.prog }, ws);
        break;
      }
      case 'llegada': {
        const who = m.id ?? id;
        if (room.phase !== 'carrera' || room.finish.has(who)) return;
        if (who !== id && !(who >= 1000 && id === hostId())) return;
        room.finish.set(who, m.time);
        room.firstFinishAt ??= now();
        broadcast({ t: 'llegada', id: who, time: m.time });
        clearTimeout(room.timer);
        room.timer = setTimeout(checkEnd, MULTI.RESULTS_WAIT * 1000 + 50);
        checkEnd();
        break;
      }
      case 'ping':
        send(ws, { t: 'pong', c: m.c, serverNow: now() });
        break;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ t: 'salio', id, host: hostId() });
    if (room.phase === 'espera') {
      if (!joined().length) {
        clearTimeout(room.timer);
        room = newRoom();
      } else broadcast(lobbyInfo());
    } else {
      checkEnd();
    }
  });
});

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
console.log(`Servidor multijugador en el puerto ${MULTI.PORT}`);
console.log(`En la otra compu abrí:  ${ips.map((ip) => `http://${ip}:5173`).join('  ó  ') || 'http://<IP-de-esta-compu>:5173'}`);
console.log('(en esta compu corré también:  npm run dev:lan)');
