// Modo rally: etapa de punta a punta con cuenta regresiva, parciales, llegada, récord y fantasma.
// Usa el mismo panel que la carrera de Mónaco y la misma forma de hablar con main.js.
import { CARS, COPILOT } from '../../config.js';
import { createCodriver } from './codriver.js';
import { createMinimap } from './minimap.js';
import { beep } from '../../core/audio.js';
import { rotateVec } from '../driving/vehicle.js';
import { submitRecord } from '../../net/player.js';

const PENALTY = 5; // segundos por reubicar con R
const fmt = (t) => {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

export function createRally(track, finishIdx, place = 'rally') {
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
  const splits = track.splits;
  const map = createMinimap(track);
  let lastRender = 0;
  const codriver = createCodriver(track, { enabled: COPILOT.RALLY, finishIdx });

  let carId = null;
  let phase = 'grid';
  let t = 0, goAt = 0, clock = 0, goClock = 0;
  let idx = 2, lastOn = 0;
  let splitTimes = [null, null, null];
  let penalty = 0, finishTime = null;
  let best = null, bestSplits = [null, null, null], last = null;
  let msgT = 0, wrongWay = 0, offRoad = 0;
  let rec = [], recNext = 0, ghost = null, ghostI = 0;

  const key = (what) => `sport-games:${place}:${what}:${carId}`;
  const load = (what) => {
    try {
      return JSON.parse(localStorage.getItem(key(what)) ?? 'null');
    } catch {
      return null;
    }
  };
  const save = (what, v) => {
    try {
      localStorage.setItem(key(what), JSON.stringify(v));
    } catch {}
  };
  function say(text, secs = 2) {
    el.msg.textContent = text;
    el.msg.hidden = false;
    msgT = secs;
  }

  return {
    show(v) {
      root.hidden = !v;
      map.show(v);
      if (!v) {
        el.lights.hidden = true;
        el.msg.hidden = true;
      }
    },

    start(id) {
      carId = id;
      const b = load('mejor');
      best = b?.time ?? null;
      bestSplits = b?.splits ?? [null, null, null];
      const g = load('fantasma');
      ghost = Array.isArray(g) && g.length > 10 ? g : null;
      phase = 'grid';
      t = 0;
      goAt = 4.4 + Math.random() * 0.8;
      clock = 0;
      idx = 2;
      lastOn = 0;
      splitTimes = [null, null, null];
      penalty = 0;
      finishTime = null;
      rec = [];
      recNext = 0;
      ghostI = 0;
      codriver.reset();
      el.lights.hidden = false;
      el.bulbs.forEach((x) => x.classList.remove('on'));
      el.msg.hidden = true;
      this.render(0, true);
    },

    filterInput(input) {
      if (phase === 'fin') return { ...input, throttle: 0, brake: 0.4 };
      if (phase === 'carrera') return input;
      return { ...input, throttle: 0, handbrake: true };
    },

    update(dt, vehicle) {
      clock += dt;
      const pos = vehicle.body.translation();
      const fwd = rotateVec(vehicle.body.rotation(), { x: 1, y: 0, z: 0 });
      map.update(dt, idx, pos, fwd);
      if (msgT > 0 && (msgT -= dt) <= 0) el.msg.hidden = true;

      if (phase === 'grid') {
        t += dt;
        const on = Math.min(5, Math.floor(t / 0.8) + 1);
        if (on !== lastOn && t < goAt) {
          beep(520, 0.15);
          lastOn = on;
        }
        el.bulbs.forEach((x, i) => x.classList.toggle('on', i < on && t < goAt));
        if (t >= goAt) {
          phase = 'carrera';
          goClock = clock;
          beep(880, 0.45, 0.3);
          say('¡VAMOS!', 1.2);
          setTimeout(() => (el.lights.hidden = true), 1200);
        }
        this.render(0);
        return;
      }

      // dónde va (camino abierto: sin dar la vuelta)
      const prev = idx;
      let bi = idx, bd = Infinity;
      for (let o = -40; o <= 60; o++) {
        const k = idx + o;
        if (k < 0 || k >= n) continue;
        const p = track.p[k];
        const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + ((p.y - pos.y) * 0.5) ** 2;
        if (d < bd) {
          bd = d;
          bi = k;
        }
      }
      // no se puede "cortar" una horquilla por el monte: el avance tiene que ser posible a esa velocidad
      const speed = Math.hypot(vehicle.body.linvel().x, vehicle.body.linvel().z);
      const maxAdvance = Math.ceil((speed * dt * 1.6) / track.step) + 2;
      idx = Math.min(bi, prev + maxAdvance);
      const elapsed = clock - goClock + penalty;

      if (phase === 'carrera') {
        codriver.update(idx, speed);
        // parciales
        splits.forEach((k, i) => {
          if (splitTimes[i] == null && prev < k && idx >= k) {
            splitTimes[i] = elapsed;
            const b = bestSplits[i];
            const diff = b != null ? elapsed - b : null;
            say(`Parcial ${i + 1}: ${fmt(elapsed)}${diff != null ? `  (${diff <= 0 ? '' : '+'}${diff.toFixed(2)})` : ''}`, 2.2);
          }
        });
        // llegada
        if (prev < finishIdx && idx >= finishIdx) {
          finishTime = elapsed;
          last = finishTime;
          phase = 'fin';
          submitRecord({ place, car: carId, time: finishTime, sectors: [...splitTimes] });
          if (best == null || finishTime < best) {
            best = finishTime;
            bestSplits = [...splitTimes];
            save('mejor', { time: best, splits: bestSplits });
            if (rec.length > 10) {
              ghost = rec;
              save('fantasma', ghost);
            }
            say(`¡RÉCORD DE ETAPA! ${fmt(finishTime)}`, 4);
          } else {
            say(`Llegada: ${fmt(finishTime)}`, 3);
          }
        }
        // grabar para el fantasma
        const ct = clock - goClock;
        if (ct >= recNext) {
          recNext = ct + 0.1;
          const q = vehicle.body.rotation();
          const r2 = (v) => Math.round(v * 100) / 100;
          const r4 = (v) => Math.round(v * 1e4) / 1e4;
          rec.push([r2(ct), r2(pos.x), r2(pos.y), r2(pos.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w)]);
        }
        // contramano y fuera del camino
        const v = vehicle.body.linvel(), d = track.d[idx];
        wrongWay = v.x * d.x + v.z * d.z < -4 ? wrongWay + dt : 0;
        if (wrongWay > 1) say('¡CONTRAMANO!', 0.3);
        offRoad = Math.sqrt(bd) > 45 ? offRoad + dt : 0;
        if (offRoad > 2) say('Fuera del camino: R para volver (+5 s)', 0.3);
      }
      this.render(phase === 'fin' ? finishTime : elapsed);
    },

    /** R: volver al camino cuesta 5 segundos. */
    onReset() {
      if (phase === 'carrera') {
        penalty += PENALTY;
        say(`Penalización +${PENALTY} s`, 1.5);
      }
    },

    codriver,

    resetPoint() {
      return idx;
    },
    progress() {
      return idx * track.step;
    },
    get finished() {
      return finishTime;
    },

    ghostPose() {
      if (!ghost || phase === 'grid') return null;
      const tt = clock - goClock;
      if (tt > ghost[ghost.length - 1][0]) return null;
      while (ghostI < ghost.length - 2 && ghost[ghostI + 1][0] < tt) ghostI++;
      while (ghostI > 0 && ghost[ghostI][0] > tt) ghostI--;
      const a = ghost[ghostI], b = ghost[ghostI + 1];
      return { a, b, f: Math.min(1, Math.max(0, (tt - a[0]) / (b[0] - a[0] || 1))) };
    },

    render(time, force = false) {
      const now = performance.now();
      if (!force && now - lastRender < 66) return;
      lastRender = now;
      el.lap.textContent = phase === 'fin' ? '¡Llegada!' : phase === 'grid' ? 'Largada' : `Etapa ${Math.round((idx / finishIdx) * 100)}%`;
      el.time.textContent = fmt(time);
      el.last.textContent = fmt(last);
      el.best.textContent = `${fmt(best)}  ·  ${CARS[carId]?.name ?? ''}`;
      el.sectors.forEach((s, i) => {
        const v = splitTimes[i];
        s.textContent = v == null ? '—' : `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
        const b = bestSplits[i];
        s.className = v == null ? '' : b == null || v <= b ? 'good' : 'bad';
      });
    },
  };
}
