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

/** Pantalla de elección. onHighlight(id) al moverse, onChoose(id) al elegir. */
export function createCarSelect({ onHighlight, onChoose }) {
  const root = $('select');
  const list = $('cards');
  const ids = Object.keys(CARS);
  let index = 0;

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
        .join('')}`;
    card.addEventListener('mouseenter', () => set(i));
    card.addEventListener('click', () => {
      set(i);
      choose();
    });
    list.appendChild(card);
  });

  function set(i) {
    index = (i + ids.length) % ids.length;
    [...list.children].forEach((c, k) => c.classList.toggle('active', k === index));
    onHighlight(ids[index]);
  }
  function choose() {
    onChoose(ids[index]);
  }

  return {
    get visible() {
      return !root.hidden;
    },
    open(currentId) {
      root.hidden = false;
      set(Math.max(0, ids.indexOf(currentId)));
    },
    close() {
      root.hidden = true;
    },
    move(d) {
      set(index + d);
    },
    pick(i) {
      set(i);
      choose();
    },
    choose,
  };
}
