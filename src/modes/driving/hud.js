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
  let fpsAcc = 0, fpsFrames = 0;

  return {
    show(v) {
      el.hud.hidden = !v;
    },
    update(vehicle, carId, camMode, dt) {
      el.speed.textContent = Math.round(vehicle.kmh);
      el.gear.textContent = vehicle.speed < -0.5 ? 'R' : '';
      el.car.textContent = CARS[carId].name;
      el.surface.textContent = SURFACES[vehicle.surface]?.label ?? '';
      el.cam.textContent = camMode;
      fpsAcc += dt;
      fpsFrames++;
      if (fpsAcc > 0.5) {
        el.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps`;
        fpsAcc = 0;
        fpsFrames = 0;
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
