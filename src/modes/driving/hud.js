// HUD (velocímetro) y pantalla de elección de auto. HTML encima del canvas.
import { CARS, SURFACES } from '../../config.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'),
    speed: $('speed'),
    gear: $('gear'),
    car: $('car-name'),
    surface: $('surface'),
    cam: $('cam-mode'),
    fps: $('fps'),
  };
  let fpsAcc = 0, fpsFrames = 0, hudT = 0, worst = 0;
  const last = new Map();
  // tocar el texto de la página obliga al navegador a recalcular: solo si cambió
  const set = (node, v) => {
    if (last.get(node) !== v) {
      last.set(node, v);
      node.textContent = v;
    }
  };

  return {
    show(v) {
      el.hud.hidden = !v;
    },
    update(vehicle, carId, camMode, dt, pixelRatio = null) {
      fpsAcc += dt;
      worst = Math.max(worst, dt);
      hudT += dt;
      if (hudT >= 0.05) {
        hudT = 0;
        set(el.speed, String(Math.round(vehicle.kmh)));
        set(el.gear, vehicle.speed < -0.5 ? 'R' : '');
        set(el.car, CARS[carId].name);
        set(el.surface, SURFACES[vehicle.surface]?.label ?? '');
        set(el.cam, camMode);
      }
      fpsFrames++;
      if (fpsAcc > 1) {
        // fps, el peor cuadro del último segundo (si pasa de ~25 ms se nota un tirón) y la resolución
        set(el.fps, `${Math.round(fpsFrames / fpsAcc)} fps · peor ${Math.round(worst * 1000)} ms${pixelRatio ? ` · res ${pixelRatio.toFixed(2)}` : ''}`);
        fpsAcc = 0;
        fpsFrames = 0;
        worst = 0;
      }
    },
  };
}

function bestLap(place, id) {
  try {
    return JSON.parse(localStorage.getItem(`sport-games:${place}:mejor:${id}`) ?? 'null')?.lap ?? null;
  } catch {
    return null;
  }
}
function fmtLap(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** Pantalla de elección de auto y lugar. onHighlight(id) al moverse, onChoose(id, lugar) al elegir. */
export function createCarSelect({ places, onHighlight, onChoose }) {
  const root = $('select');
  const list = $('cards');
  const placesEl = $('places');
  const ids = Object.keys(CARS);
  const placeIds = Object.keys(places);
  let index = 0;
  let place = placeIds[0];

  list.innerHTML = '';
  ids.forEach((id, i) => {
    const c = CARS[id];
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--car', `#${c.color.toString(16).padStart(6, '0')}`);
    card.innerHTML = `
      <span class="key">${i + 1}</span>
      <h2>${c.name}</h2>
      ${Object.entries(c.stats)
        .map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${v}"></i></div>`)
        .join('')}
      <div class="record" data-record></div>`;
    card.addEventListener('mouseenter', () => set(i));
    card.addEventListener('click', () => {
      set(i);
      choose();
    });
    list.appendChild(card);
  });

  placesEl.innerHTML = '';
  placeIds.forEach((pid) => {
    const b = document.createElement('button');
    b.className = 'place';
    b.textContent = places[pid].name;
    b.addEventListener('click', () => setPlace(pid));
    placesEl.appendChild(b);
  });

  function set(i) {
    index = (i + ids.length) % ids.length;
    [...list.children].forEach((c, k) => c.classList.toggle('active', k === index));
    onHighlight(ids[index]);
  }
  function setPlace(pid) {
    place = pid;
    [...placesEl.children].forEach((b, k) => b.classList.toggle('active', placeIds[k] === place));
  }
  function choose() {
    onChoose(ids[index], place);
  }

  return {
    get visible() {
      return !root.hidden;
    },
    open(currentId, currentPlace) {
      root.hidden = false;
      // récord en Mónaco de cada auto
      [...list.children].forEach((card, k) => {
        const t = bestLap('monaco', ids[k]);
        card.querySelector('[data-record]').textContent = t ? `🏁 Récord Mónaco: ${fmtLap(t)}` : '🏁 Sin vueltas en Mónaco';
      });
      setPlace(places[currentPlace] ? currentPlace : placeIds[0]);
      set(Math.max(0, ids.indexOf(currentId)));
    },
    close() {
      root.hidden = true;
    },
    move(d) {
      set(index + d);
    },
    nextPlace() {
      setPlace(placeIds[(placeIds.indexOf(place) + 1) % placeIds.length]);
    },
    pick(i) {
      set(i);
      choose();
    },
    choose,
  };
}
