// Modo carrera: semáforo de largada, vueltas, sectores, mejor vuelta y "contramano".
import { CARS } from '../../config.js';

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
  const S = track.sectors; // índices donde empieza cada sector

  let carId = null;
  let phase = 'grid';   // grid → luces → carrera
  let lightT = 0, goAt = 0;
  let idx = n - 14;
  let lap = 0, lapStart = 0, clock = 0;
  let sectorStart = 0, sector = 0, sectorTimes = [null, null, null];
  let best = null, bestSectors = [null, null, null], last = null;
  let validLap = false, passed = new Set();
  let wrongWay = 0, msgT = 0;

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
      if (!v) { el.lights.hidden = true; el.msg.hidden = true; }
    },

    /** Arranca de nuevo desde la grilla. */
    start(id) {
      carId = id;
      loadBest();
      phase = 'grid';
      lightT = 0;
      goAt = 4 + 0.4 + Math.random() * 1.2; // 5 luces (0,8 s c/u) + espera al azar
      idx = n - 14;
      lap = 0;
      clock = 0;
      sector = 0;
      sectorTimes = [null, null, null];
      last = null;
      passed.clear();
      el.lights.hidden = false;
      el.bulbs.forEach((b) => b.classList.remove('on'));
      el.msg.hidden = true;
      this.render(0);
    },

    /** Durante el semáforo el auto no puede arrancar. */
    filterInput(input) {
      if (phase === 'carrera') return input;
      return { ...input, throttle: 0, handbrake: true };
    },

    update(dt, vehicle) {
      clock += dt;
      if (msgT > 0 && (msgT -= dt) <= 0) el.msg.hidden = true;

      if (phase !== 'carrera') {
        lightT += dt;
        const on = Math.min(5, Math.floor(lightT / 0.8) + 1);
        el.bulbs.forEach((b, i) => b.classList.toggle('on', i < on && lightT < goAt));
        if (lightT >= goAt) {
          phase = 'carrera';
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
        const lapTime = clock - lapStart;
        if (validLap && passed.size === 2) {
          sectorTimes[2] = clock - sectorStart;
          last = lapTime;
          if (best == null || lapTime < best) {
            best = lapTime;
            bestSectors = [...sectorTimes];
            saveBest();
            say(`¡VUELTA RÉCORD! ${fmt(lapTime)}`, 3);
          } else {
            say(`Vuelta ${lap}: ${fmt(lapTime)}`, 2.5);
          }
          lap++;
        }
        validLap = true;
        lapStart = clock;
        sectorStart = clock;
        sector = 0;
        sectorTimes = [null, null, null];
        passed.clear();
      } else if (prev < 60 && idx > n - 60) {
        validLap = false; // cruzó la línea para atrás
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

      // Contramano
      const v = vehicle.body.linvel();
      const d = track.d[idx];
      const along = v.x * d.x + v.z * d.z;
      wrongWay = along < -4 ? wrongWay + dt : 0;
      if (wrongWay > 1) say('¡CONTRAMANO!', 0.3);

      this.render(clock - lapStart);
    },

    /** Lugar para reubicar el auto: sobre la pista, mirando para adelante. */
    resetPoint() {
      return idx;
    },

    get racing() {
      return phase === 'carrera';
    },

    render(t) {
      el.lap.textContent = lap ? `Vuelta ${lap}` : 'Grilla';
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
