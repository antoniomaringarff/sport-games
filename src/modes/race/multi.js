// Multijugador: sala de espera, grilla, bots, autos de los demás, posiciones y resultados.
import { MULTI, CARS } from '../../config.js';
import { connect } from '../../net/net.js';
import { Vehicle } from '../driving/vehicle.js';
import { createCarModel } from '../driving/carModel.js';
import { carAsset, physicsProfile } from '../driving/carAssets.js';
import { BotDriver } from './ai.js';
import { RemoteCar, nameTag } from './remoteCar.js';

const $ = (id) => document.getElementById(id);
const NAME_KEY = 'sport-games:nombre';
const fmt = (t) => {
  if (t == null) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

/**
 * world: el mundo de Mónaco (physics, scene, track, gridSpot)
 * me: { vehicle(), carId(), teleport(spot) } para manejar el auto propio
 */
export function createMulti(world, me) {
  const ui = {
    lobby: $('lobby'),
    count: $('lobby-count'),
    list: $('lobby-list'),
    status: $('lobby-status'),
    name: $('lobby-name'),
    pos: $('positions'),
    results: $('results'),
    resultsList: $('results-list'),
  };
  let net = null;
  let active = false;
  let phase = 'off'; // sala → carrera → resultados
  let lobby = null;
  let grid = [];
  let hostId = null;
  const remotes = new Map(); // id -> RemoteCar
  const bots = new Map();    // id -> { vehicle, model, driver, entry }
  let sendT = 0, posT = 0;
  let goAtServer = 0;
  let raceLaps = MULTI.LAPS;

  ui.name.value = loadName();
  ui.name.addEventListener('input', () => {
    saveName(ui.name.value);
    net?.send({ t: 'nombre', name: ui.name.value });
  });
  // que escribir el nombre no maneje el auto
  ui.name.addEventListener('keydown', (e) => e.stopPropagation());

  function enter() {
    active = true;
    phase = 'sala';
    showLobby(true);
    ui.status.textContent = 'Conectando…';
    ui.list.innerHTML = '';
    ui.count.textContent = '';
    me.teleport(world.gridSpot(0));
    world.race.start(me.carId(), { goIn: null, laps: MULTI.LAPS, idx: spotIdx(0) });
    if (net?.open) return join();
    net?.close();
    net = connect();
    net.on('abierto', join);
    net.on('hola', () => {});
    net.on('sala', onLobby);
    net.on('largada', onStart);
    net.on('estado', onState);
    net.on('llegada', (m) => {
      const r = remotes.get(m.id);
      if (r) r.finishTime = m.time;
    });
    net.on('salio', (m) => {
      hostId = m.host;
      const r = remotes.get(m.id);
      if (r) {
        r.dispose();
        remotes.delete(m.id);
      }
    });
    net.on('resultados', onResults);
    net.on('cerrado', () => {
      if (!active) return;
      ui.status.innerHTML = `No hay conexión con el servidor.<br><small>En la compu que hace de servidor: <code>npm run server</code></small>`;
    });
  }

  function join() {
    net.send({ t: 'entrar', name: ui.name.value || 'Jugador', car: me.carId() });
  }

  function onLobby(m) {
    lobby = m;
    hostId = m.host;
    if (phase !== 'sala') return;
    ui.list.innerHTML = m.players
      .map((p) => `<li class="${p.id === net.id ? 'me' : ''}"><b>${esc(p.name)}</b><span>${CARS[p.car]?.name ?? p.car}</span></li>`)
      .join('');
    const bots = Math.max(0, m.grid - m.players.length);
    ui.status.textContent = m.phase === 'carrera'
      ? 'Hay una carrera en curso: entrás en la próxima.'
      : `${m.players.length}/${m.max} jugadores${bots ? ` · se completa con ${bots} bot${bots > 1 ? 's' : ''}` : ''}`;
  }

  function onStart(m) {
    cleanupCars();
    grid = m.grid;
    hostId = m.host;
    goAtServer = m.goAt;
    raceLaps = m.laps;
    phase = 'carrera';
    showLobby(false);
    ui.results.hidden = true;
    const mine = grid.find((g) => g.id === net.id);
    if (!mine) return; // llegó tarde: mira desde la sala
    me.teleport(world.gridSpot(mine.slot));
    world.race.start(me.carId(), {
      goIn: (m.goAt - net.now()) / 1000,
      laps: m.laps,
      idx: spotIdx(mine.slot),
      onFinish: (time) => net.send({ t: 'llegada', time }),
    });
    for (const g of grid) {
      if (g.id === net.id) continue;
      if (g.bot && hostId === net.id) addBot(g);
      else remotes.set(g.id, new RemoteCar(world.physics, world.scene, g));
    }
    ui.pos.hidden = false;
  }

  function addBot(g) {
    const profile = physicsProfile(g.car);
    const vehicle = new Vehicle(world.physics, profile, world.gridSpot(g.slot));
    const model = createCarModel(g.car, profile, vehicle, carAsset(g.car));
    const tag = nameTag(g.name, '#9fd8ff');
    tag.position.y = profile.HEIGHT / 2 + 1.4;
    model.group.add(tag);
    world.scene.add(model.group);
    const [lo, hi] = MULTI.BOT_SKILL;
    const driver = new BotDriver(vehicle, world.track, {
      skill: lo + Math.random() * (hi - lo),
      lane: (g.slot % 2 ? 1 : -1) * (1 + Math.random() * 1.5),
      idx: spotIdx(g.slot),
    });
    bots.set(g.id, { vehicle, model, driver, entry: g, tag, finishTime: null });
  }

  function onState(m) {
    if (bots.has(m.id) || m.id === net.id) return;
    remotes.get(m.id)?.push(m);
  }

  function onResults(m) {
    phase = 'resultados';
    ui.pos.hidden = true;
    ui.resultsList.innerHTML = m.results
      .map((r, i) => `<li class="${r.id === net.id ? 'me' : ''}"><em>${i + 1}°</em><b>${esc(r.name)}${r.bot ? ' 🤖' : ''}</b><span>${CARS[r.car]?.name ?? ''}</span><span>${r.time != null ? fmt(r.time) : 'no llegó'}</span></li>`)
      .join('');
    ui.results.hidden = false;
  }

  function cleanupCars() {
    for (const r of remotes.values()) r.dispose();
    remotes.clear();
    for (const b of bots.values()) {
      world.scene.remove(b.model.group);
      b.model.dispose();
      b.tag.material.map.dispose();
      b.vehicle.dispose();
    }
    bots.clear();
  }

  function showLobby(v) {
    ui.lobby.hidden = !v;
  }

  /** índice de la pista de cada lugar de la grilla */
  function spotIdx(slot) {
    return (world.track.n - 10 - slot * 4 + world.track.n) % world.track.n;
  }

  return {
    get active() {
      return active;
    },
    get phase() {
      return phase;
    },
    /** para depurar desde la consola */
    debug() {
      return {
        me: net?.id, host: hostId,
        bots: [...bots].map(([id, b]) => ({ id, crossings: b.driver.tracker.crossings, idx: b.driver.tracker.idx, prog: b.driver.tracker.progress(), kmh: Math.round(b.vehicle.kmh) })),
        remotes: [...remotes].map(([id, r]) => ({ id, prog: r.prog })),
      };
    },
    enter,

    /** Enter: volver a jugar después de los resultados. */
    again() {
      if (phase !== 'resultados') return;
      ui.results.hidden = true;
      cleanupCars();
      enter();
    },

    leave() {
      active = false;
      phase = 'off';
      cleanupCars();
      showLobby(false);
      ui.pos.hidden = true;
      ui.results.hidden = true;
      net?.close();
      net = null;
    },

    /** Antes de cada paso de física: manejar los bots. */
    beforeStep(dt) {
      if (!active || phase !== 'carrera') return;
      const racing = net.now() >= goAtServer;
      for (const b of bots.values()) b.vehicle.update(b.driver.input(dt, racing), dt);
    },

    update(dt) {
      if (!active) return;
      if (phase === 'sala' && lobby?.endsAt && lobby.phase === 'espera') {
        const left = Math.max(0, Math.ceil((lobby.endsAt - net.now()) / 1000));
        ui.count.textContent = `${left}`;
      }
      if (phase !== 'carrera') return;
      const now = net.now();
      // bots: dibujar y ver si llegaron
      for (const [id, b] of bots) {
        const t = b.vehicle.body.translation(), r = b.vehicle.body.rotation();
        b.model.group.position.set(t.x, t.y, t.z);
        b.model.group.quaternion.set(r.x, r.y, r.z, r.w);
        b.model.group.updateMatrixWorld();
        b.model.update(dt);
        const tr = b.driver.tracker;
        if (tr.crossings > raceLaps && b.finishTime == null) {
          b.finishTime = (now - goAtServer) / 1000;
          net.send({ t: 'llegada', id, time: b.finishTime });
        }
      }
      for (const r of remotes.values()) r.update(dt, now);

      // mandar mi posición (y la de mis bots) ~20 veces por segundo
      sendT += dt;
      if (sendT >= 1 / MULTI.SEND_HZ) {
        sendT = 0;
        const v = me.vehicle();
        net.send({ t: 'estado', s: pack(v), time: now, prog: world.race.progress() });
        for (const [id, b] of bots) net.send({ t: 'estado', id, s: pack(b.vehicle), time: now, prog: b.driver.tracker.progress() });
      }

      // posiciones
      posT += dt;
      if (posT > 0.25) {
        posT = 0;
        renderPositions();
      }
    },
  };

  function renderPositions() {
    const rows = grid.map((g) => {
      if (g.id === net.id) return { g, prog: world.race.progress(), fin: world.race.finished, me: true };
      const b = bots.get(g.id);
      if (b) return { g, prog: b.driver.tracker.progress(), fin: b.finishTime };
      const r = remotes.get(g.id);
      return { g, prog: r?.prog ?? -Infinity, fin: r?.finishTime ?? null };
    });
    rows.sort((a, b) => {
      if (a.fin != null || b.fin != null) return (a.fin ?? Infinity) - (b.fin ?? Infinity);
      return b.prog - a.prog;
    });
    const myPos = rows.findIndex((r) => r.me) + 1;
    ui.pos.innerHTML = `<div class="big">P${myPos}<small>/${rows.length}</small></div><ol>${rows
      .map((r) => `<li class="${r.me ? 'me' : ''}">${esc(r.g.name)}${r.g.bot ? ' 🤖' : ''}${r.fin != null ? ' 🏁' : ''}</li>`)
      .join('')}</ol>`;
  }
}

function pack(v) {
  const t = v.body.translation(), q = v.body.rotation();
  const r = (x, d = 100) => Math.round(x * d) / d;
  return [r(t.x), r(t.y), r(t.z), r(q.x, 1e4), r(q.y, 1e4), r(q.z, 1e4), r(q.w, 1e4), r(v.speed, 10), r(v.steer, 100)];
}
function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
function saveName(n) {
  try {
    localStorage.setItem(NAME_KEY, n.slice(0, 16));
  } catch {}
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
