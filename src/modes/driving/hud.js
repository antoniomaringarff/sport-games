// HUD (velocímetro) y pantalla de elección de auto. HTML encima del canvas.
import { CARS, CAR_IDS, SECTIONS, SURFACES, COLORS } from '../../config.js';
import { carColor, savedColor, chooseColor } from './colors.js';

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

const hexCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * Pantalla de elección de auto, color y lugar.
 * onHighlight(id) al moverse o cambiar el color, onPlace(lugar) al cambiar de lugar, onChoose(id, lugar) al elegir.
 */
export function createCarSelect({ places, onHighlight, onChoose, onPlace = () => {} }) {
  const root = $('select');
  const list = $('cards');
  const placesEl = $('places');
  const colorsEl = $('colors');
  const sectionsEl = $('sections');
  const ids = CAR_IDS;
  const placeIds = Object.keys(places);
  let index = 0;
  let place = placeIds[0];

  // Secciones: solo se ven las tarjetas de la sección del auto marcado
  sectionsEl.innerHTML = '';
  Object.entries(SECTIONS).forEach(([sid, name]) => {
    const b = document.createElement('button');
    b.className = 'section';
    b.dataset.section = sid;
    b.innerHTML = `${name} <small>${ids.filter((id) => CARS[id].section === sid).length}</small>`;
    b.addEventListener('click', () => set(ids.findIndex((id) => CARS[id].section === sid)));
    sectionsEl.appendChild(b);
  });

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
    card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && set(i));
    // con el dedo, el primer toque marca el auto (se ve en el showroom) y el segundo lo elige
    let tapByTouch = false, wasActive = false;
    card.addEventListener('pointerdown', (e) => {
      tapByTouch = e.pointerType !== 'mouse';
      wasActive = index === i;
    });
    card.addEventListener('click', () => {
      set(i);
      if (!tapByTouch || wasActive) choose();
      tapByTouch = false;
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

  // Colores: "al azar" + la paleta. El elegido se recuerda para cada auto.
  const colorIds = [null, ...Object.keys(COLORS)];
  colorsEl.innerHTML = '';
  colorIds.forEach((cid) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    if (cid == null) {
      b.classList.add('random');
      b.textContent = '🎲';
      b.title = 'Al azar';
    } else if (COLORS[cid].hex == null) {
      b.classList.add('original');
      b.title = COLORS[cid].name;
    } else {
      b.style.setProperty('--c', hexCss(COLORS[cid].hex));
      b.title = COLORS[cid].name;
    }
    b.setAttribute('aria-label', `Color: ${b.title}`);
    b.addEventListener('click', () => setColor(cid));
    colorsEl.appendChild(b);
  });

  function renderColors() {
    const id = ids[index];
    const saved = savedColor(id);
    const now = carColor(id);
    [...colorsEl.children].forEach((b, k) => {
      const cid = colorIds[k];
      b.classList.toggle('active', cid === saved);
      // al azar: se marca el color que tocó, con un borde punteado
      b.classList.toggle('rolled', !saved && cid === now);
    });
    const label = saved ? COLORS[saved].name : `al azar (${COLORS[now].name.toLowerCase()})`;
    colorsEl.dataset.label = `Color: ${label}`;
    // la franja de arriba de cada tarjeta muestra el color con el que sale ese auto
    [...list.children].forEach((card, k) => {
      card.style.setProperty('--car', hexCss(COLORS[carColor(ids[k])].hex ?? CARS[ids[k]].color));
    });
  }
  function setColor(cid) {
    chooseColor(ids[index], cid);
    renderColors();
    onHighlight(ids[index]);
  }

  function set(i) {
    index = (i + ids.length) % ids.length;
    const section = CARS[ids[index]].section;
    [...list.children].forEach((c, k) => {
      c.classList.toggle('active', k === index);
      c.hidden = CARS[ids[k]].section !== section;
    });
    [...sectionsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    renderColors();
    onHighlight(ids[index]);
  }
  function setPlace(pid) {
    place = pid;
    [...placesEl.children].forEach((b, k) => b.classList.toggle('active', placeIds[k] === place));
    onPlace(place);
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
    /** C: pasar al color siguiente del auto marcado. */
    nextColor() {
      const saved = savedColor(ids[index]);
      setColor(colorIds[(colorIds.indexOf(saved) + 1) % colorIds.length]);
    },
    pick(i) {
      set(i);
      choose();
    },
    choose,
  };
}
