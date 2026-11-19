// Modo carrera: semáforo de largada, vueltas, sectores, mejor vuelta y "contramano".
import { CARS } from '../../config.js';
import { createMinimap } from './minimap.js';
import { beep } from '../../core/audio.js';
import { rotateVec } from '../driving/vehicle.js';

const fmt = (t) => {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

export function createRace(track, place) {
  const root = document.getElementById('race');
  const el = {
    lap: root.querySelector('[data-lap]'),
    time: root.querySelector('[data-time]'),
    last: root.querySelector('[data-last]'),
    best: root.querySelector('[data-best]'),
    sectors: [...root.querySelectorAll('[data-sector]')],
    lights: document.getElementById('lights'),
    bulbs: [...document.querySelectorAll('#lights i')],
    msg: document.getElementById('race-msg'),
  };
  const n = track.n;
  const S = track.sectors;
  const map = createMinimap(track); // índices donde empieza cada sector

  let carId = null;
  let phase = 'grid';   // grid → luces → carrera
  let lightT = 0, goAt = 0;
  let idx = n - 14;
  let lap = 0, lapStart = 0, clock = 0;
  let sectorStart = 0, sector = 0, sectorTimes = [null, null, null];
  let best = null, bestSectors = [null, null, null], last = null;
  let validLap = false, passed = new Set();
  let wrongWay = 0, msgT = 0, lastOn = 0;
  // Fantasma: la mejor vuelta grabada cada 0,1 s → [t, x, y, z, qx, qy, qz, qw]
  const GHOST_DT = 0.1;
  let rec = [], recNext = 0;
  let ghost = null, ghostI = 0;
  // Carrera con vueltas (multijugador): cruces de la línea, llegada
  let laps = null, crossings = 0, goClock = 0, finishTime = null, onFinish = null, waiting = false;
  let goWall = null; // hora real de la largada (multijugador: igual para todos aunque un cuadro se atrase)

  const key = () => `sport-games:${place}:mejor:${carId}`;
  function loadBest() {
    try {
      const v = JSON.parse(localStorage.getItem(key()) ?? 'null');
      best = v?.lap ?? null;
      bestSectors = v?.sectors ?? [null, null, null];
    } catch {
      best = null;
    }
  }
  function saveBest() {
    try {
      localStorage.setItem(key(), JSON.stringify({ lap: best, sectors: bestSectors }));
    } catch {}
  }
  const ghostKey = () => `sport-games:${place}:fantasma:${carId}`;
  function loadGhost() {
    try {
      const raw = JSON.parse(localStorage.getItem(ghostKey()) ?? 'null');
      ghost = Array.isArray(raw) && raw.length > 10 ? raw : null;
    } catch {
      ghost = null;
    }
  }
  function saveGhost() {
    try {
      localStorage.setItem(ghostKey(), JSON.stringify(ghost));
    } catch {}
  }
  function record(t, vehicle) {
    if (t < recNext) return;
    recNext = t + GHOST_DT;
    const p = vehicle.body.translation(), q = vehicle.body.rotation();
    const r2 = (v) => Math.round(v * 100) / 100;
    const r4 = (v) => Math.round(v * 10000) / 10000;
    rec.push([r2(t), r2(p.x), r2(p.y), r2(p.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w)]);
  }

  function say(text, secs = 2) {
    el.msg.textContent = text;
    el.msg.hidden = false;
    msgT = secs;
  }

  /** Índice de la pista más cercano, buscando cerca del anterior. */
  function nearest(pos, from, range) {
    let bi = from, bd = Infinity;
    for (let o = -range; o <= range; o++) {
      const k = (from + o + n) % n;
      const p = track.p[k];
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + ((p.y - pos.y) * 0.5) ** 2;
      if (d < bd) { bd = d; bi = k; }
    }
    return bi;
  }

  return {
    show(v) {
      root.hidden = !v;
      map.show(v);
      if (!v) { el.lights.hidden = true; el.msg.hidden = true; }
    },

    /**
     * Arranca de nuevo desde la grilla.
     * opts: { goIn: segundos hasta que se apagan las luces (null = esperar a go()),
     *         laps: vueltas de la carrera (null = libre), onFinish(tiempo), idx: punto de largada }
     */
    start(id, opts = {}) {
      carId = id;
      loadBest();
      loadGhost();
      rec = [];
      recNext = 0;
      phase = 'grid';
      lightT = 0;
      lastOn = 0;
      goAt = 4 + 0.4 + Math.random() * 1.2; // 5 luces (0,8 s c/u) + espera al azar
      laps = opts.laps ?? null;
      onFinish = opts.onFinish ?? null;
      crossings = 0;
      finishTime = null;
      waiting = opts.goIn === null;
      goWall = null;
      if (opts.goIn != null) this.go(opts.goIn);
      idx = opts.idx ?? n - 14;
      lap = 0;
      clock = 0;
      sector = 0;
      sectorTimes = [null, null, null];
      last = null;
      passed.clear();
      el.lights.hidden = waiting;
      el.bulbs.forEach((b) => b.classList.remove('on'));
      el.msg.hidden = true;
      this.render(0);
    },

    /** Programa la largada: las luces se apagan dentro de `secs` segundos. */
    go(secs) {
      waiting = false;
      // las 5 luces se prenden en los 4 s anteriores; lightT negativo = todavía nada
      goAt = Math.max(0.5, Math.min(4.4, secs));
      lightT = goAt - secs;
      goWall = performance.now() + secs * 1000;
      el.lights.hidden = false;
    },

    /** Progreso en la carrera (para ordenar posiciones): metros desde la largada. */
    progress() {
      return ((crossings - 1) * n + idx) * track.step;
    },
    get finished() {
      return finishTime;
    },
    get lapNumber() {
      return Math.max(1, Math.min(crossings, laps ?? crossings));
    },

    /** Durante el semáforo el auto no puede arrancar. */
    filterInput(input) {
      if (phase === 'fin') return { ...input, throttle: 0, brake: 0.3 };
      if (phase === 'carrera') return input;
      return { ...input, throttle: 0, handbrake: true };
    },

    update(dt, vehicle) {
      clock += dt;
      const fwd = rotateVec(vehicle.body.rotation(), { x: 1, y: 0, z: 0 });
      map.update(dt, idx, vehicle.body.translation(), fwd);
      if (msgT > 0 && (msgT -= dt) <= 0) el.msg.hidden = true;

      if (phase === 'grid' || phase === 'luces') {
        if (waiting) {
          this.render(0);
          return;
        }
        lightT = goWall ? goAt - (goWall - performance.now()) / 1000 : lightT + dt;
        const on = lightT < 0 ? 0 : Math.min(5, Math.floor(lightT / 0.8) + 1);
        if (on !== lastOn && on > 0 && lightT < goAt) { beep(520, 0.15); lastOn = on; }
        el.bulbs.forEach((b, i) => b.classList.toggle('on', i < on && lightT < goAt));
        if (lightT >= goAt) {
          phase = 'carrera';
          goClock = clock;
          beep(880, 0.45, 0.3);
          lapStart = clock;
          sectorStart = clock;
          lap = 1;
          validLap = false; // la primera vuelta arranca detrás de la línea
          say('¡VAMOS!', 1.2);
          setTimeout(() => (el.lights.hidden = true), 1200);
        }
        this.render(0);
        return;
      }

      const pos = vehicle.body.translation();
      const prev = idx;
      idx = nearest(pos, idx, 40);
      // si se fue muy lejos (reubicó), buscar en toda la vuelta
      const p = track.p[idx];
      if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 > 30 ** 2) idx = nearest(pos, idx, n >> 1);

      // ¿Cruzó la línea de llegada hacia adelante?
      if (prev > n - 60 && idx < 60) {
        crossings++;
        if (laps && crossings > laps && finishTime == null) {
          finishTime = clock - goClock;
          phase = 'fin';
          say(`¡LLEGASTE! ${fmt(finishTime)}`, 3);
          onFinish?.(finishTime);
        }
        const lapTime = clock - lapStart;
        if (validLap && passed.size === 2) {
          sectorTimes[2] = clock - sectorStart;
          last = lapTime;
          if (best == null || lapTime < best) {
            best = lapTime;
            bestSectors = [...sectorTimes];
            saveBest();
            if (rec.length > 10) {
              ghost = rec;
              saveGhost();
            }
            say(`¡VUELTA RÉCORD! ${fmt(lapTime)}`, 3);
          } else {
            say(`Vuelta ${lap}: ${fmt(lapTime)}`, 2.5);
          }
          lap++;
        }
        validLap = true;
        rec = [];
        recNext = 0;
        ghostI = 0;
        lapStart = clock;
        sectorStart = clock;
        sector = 0;
        sectorTimes = [null, null, null];
        passed.clear();
      } else if (prev < 60 && idx > n - 60) {
        validLap = false; // cruzó la línea para atrás
        crossings--;
      }
      // Sectores
      for (const s of [1, 2]) {
        if (!passed.has(s) && prev < S[s] && idx >= S[s] && idx - prev < 50) {
          passed.add(s);
          sectorTimes[s - 1] = clock - sectorStart;
          sectorStart = clock;
          sector = s;
        }
      }

      if (validLap) record(clock - lapStart, vehicle);

      // Contramano
      const v = vehicle.body.linvel();
      const d = track.d[idx];
      const along = v.x * d.x + v.z * d.z;
      wrongWay = along < -4 ? wrongWay + dt : 0;
      if (wrongWay > 1) say('¡CONTRAMANO!', 0.3);

      this.render(clock - lapStart);
    },

    /** Al reubicar con R la vuelta no cuenta como récord. */
    onReset() {
      if (phase === 'carrera' && validLap) {
        validLap = false;
        say('Vuelta anulada', 1.5);
      }
    },

    /**
     * Dónde está el fantasma ahora: { a, b, f } (dos muestras y cuánto mezclar) o null.
     */
    ghostPose() {
      if (!ghost || phase !== 'carrera' || !validLap) return null;
      const t = clock - lapStart;
      if (t > ghost[ghost.length - 1][0]) return null;
      while (ghostI < ghost.length - 2 && ghost[ghostI + 1][0] < t) ghostI++;
      while (ghostI > 0 && ghost[ghostI][0] > t) ghostI--;
      const a = ghost[ghostI], b = ghost[ghostI + 1];
      return { a, b, f: Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1))) };
    },

    /** Lugar para reubicar el auto: sobre la pista, mirando para adelante. */
    resetPoint() {
      return idx;
    },

    get racing() {
      return phase === 'carrera';
    },

    render(t) {
      el.lap.textContent = laps
        ? phase === 'fin' ? '¡Llegada!' : crossings ? `Vuelta ${Math.min(crossings, laps)}/${laps}` : 'Grilla'
        : lap ? `Vuelta ${lap}` : 'Grilla';
      el.time.textContent = fmt(phase === 'carrera' && validLap ? t : phase === 'carrera' ? t : 0);
      el.last.textContent = fmt(last);
      el.best.textContent = `${fmt(best)}  ·  ${CARS[carId]?.name ?? ''}`;
      el.sectors.forEach((s, i) => {
        const v = sectorTimes[i];
        s.textContent = v == null ? '—' : v.toFixed(2);
        const b = bestSectors[i];
        s.className = v == null ? '' : b == null || v <= b ? 'good' : 'bad';
      });
    },
  };
}
