// Controles táctiles para celular y tablet, copiados de F1 Mobile Racing y Real Racing 3:
// un pulgar dobla (volante deslizando, botones ◀ ▶ o inclinando el aparato) y el otro
// acelera y frena con pedales. Se puede acelerar solo y pasar el volante al otro lado.
import { TOUCH } from '../config.js';

const KEY = 'sport-games:tactil';
const DEFAULTS = { steer: 'volante', gas: 'pedal', side: 'izq' };
const OPTIONS = [
  { key: 'steer', label: 'Dirección', values: { volante: 'Volante', botones: 'Botones ◀ ▶', inclinar: 'Inclinar' } },
  { key: 'gas', label: 'Acelerador', values: { pedal: 'Pedal', auto: 'Automático' } },
  { key: 'side', label: 'Volante a la', values: { izq: 'Izquierda', der: 'Derecha' } },
];
const D2R = Math.PI / 180;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let cfg = loadCfg();
let visible = false; // manejando: se ven los controles
let onAction = () => {};
const held = new Map(); // pointerId → control apretado (gas, brake, handbrake, left, right)
const wheel = { id: null, x0: 0, steer: 0 };
let tilt = 0;
let tiltOn = false;
let tiltMsg = '';
let root, wheelEl, pauseEl, controlsEl;

function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return Object.fromEntries(OPTIONS.map((o) => [o.key, o.values[c[o.key]] ? c[o.key] : DEFAULTS[o.key]]));
  } catch {
    return { ...DEFAULTS };
  }
}

/** Lo que piden los controles táctiles este cuadro, o null si no se están usando. */
export function readTouch() {
  if (!visible) return null;
  const on = new Set(held.values());
  const brake = on.has('brake') ? 1 : 0;
  let steer = wheel.steer;
  if (cfg.steer === 'botones') steer = (on.has('right') ? 1 : 0) - (on.has('left') ? 1 : 0);
  else if (cfg.steer === 'inclinar') steer = tilt;
  return {
    // automático: acelera siempre, salvo mientras se frena (y con el freno quieto, marcha atrás)
    throttle: on.has('gas') || (cfg.gas === 'auto' && !brake) ? 1 : 0,
    brake,
    steer,
    handbrake: on.has('handbrake'),
  };
}

export function isTouch() {
  return document.body.classList.contains('touch');
}

/** onAction(code): los botones de la pantalla "aprietan" las mismas teclas que el teclado. */
export function initTouch(opts) {
  onAction = opts.onAction;
  root = $('touch');
  wheelEl = $('t-wheel');
  pauseEl = $('pause');
  controlsEl = $('controls');

  if (matchMedia('(pointer: coarse)').matches) enable();
  window.addEventListener('touchstart', enable, { once: true, passive: true });
  // que pellizcar o tocar dos veces no haga zoom en el iPhone
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('lostpointercapture', onUp);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);

  // botones que solo aprietan una tecla (menú, sala, resultados, cámara, reubicar)
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-key]');
    if (b) onAction(b.dataset.key);
  });
  $('t-pause').addEventListener('click', () => {
    onAction('Pause');
    pauseEl.hidden = false;
  });
  pauseEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'KeyM' || act === 'KeyG' || act === 'KeyV') return onAction(act);
    pauseEl.hidden = true;
    if (act === 'Restart') {
      onAction('Resume');
      onAction('Enter');
    } else onAction(act);
  });
  $('t-config').addEventListener('click', () => (controlsEl.hidden = false));
  controlsEl.querySelector('[data-close]').addEventListener('click', () => (controlsEl.hidden = true));
  document.querySelectorAll('.t-settings').forEach((el) => el.addEventListener('click', onOption));

  applyLayout();
}

function enable() {
  document.body.classList.add('touch');
}

/** Mostrar los controles al manejar, esconderlos en el menú. */
function show(v) {
  visible = v && isTouch();
  root.hidden = !visible;
  if (!v) {
    pauseEl.hidden = true;
    releaseAll();
  }
}

/**
 * Al tocar "correr": pantalla completa, apaisado y permiso para inclinar.
 * Se llama dentro del toque porque los navegadores solo lo dejan pedir ahí.
 */
function prepare() {
  if (!isTouch()) return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }
  if (cfg.steer === 'inclinar') enableTilt();
}

function closePause() {
  pauseEl.hidden = true;
}

export const touchUi = { show, prepare, closePause };

// ---------- Pedales y botones: el pulgar puede deslizarse de uno a otro ----------
function ctlAt(x, y) {
  return document.elementFromPoint(x, y)?.closest?.('[data-ctl]')?.dataset.ctl ?? null;
}

function onDown(e) {
  const ctl = e.target.closest('[data-ctl]');
  const zone = !ctl && e.target.closest('#t-zone');
  if (!ctl && !zone) return;
  e.preventDefault();
  try {
    (ctl ?? zone).setPointerCapture(e.pointerId);
  } catch {}
  if (ctl) {
    held.set(e.pointerId, ctl.dataset.ctl);
    paint();
    return;
  }
  if (wheel.id !== null) return;
  wheel.id = e.pointerId;
  wheel.x0 = e.clientX;
  wheel.steer = 0;
  wheelEl.classList.add('active');
  wheelEl.style.left = `${e.clientX}px`;
  wheelEl.style.top = `${e.clientY}px`;
  paintWheel();
}

function onMove(e) {
  if (e.pointerId === wheel.id) {
    const range = Math.max(40, Math.min(innerWidth, innerHeight) * TOUCH.WHEEL_TRAVEL);
    let dx = e.clientX - wheel.x0;
    // pasado el tope, el centro acompaña al pulgar: volver para el otro lado responde enseguida
    if (Math.abs(dx) > range) {
      wheel.x0 = e.clientX - Math.sign(dx) * range;
      dx = Math.sign(dx) * range;
    }
    const v = Math.abs(dx) / range;
    const dz = TOUCH.WHEEL_DEADZONE;
    wheel.steer = Math.sign(dx) * Math.pow(Math.max(0, v - dz) / (1 - dz), TOUCH.WHEEL_CURVE);
    paintWheel();
    return;
  }
  if (!held.has(e.pointerId)) return;
  // si el pulgar se sale de todos los botones, sigue apretado el último
  const c = ctlAt(e.clientX, e.clientY);
  if (c && c !== held.get(e.pointerId)) {
    held.set(e.pointerId, c);
    paint();
  }
}

function onUp(e) {
  if (e.pointerId === wheel.id) {
    wheel.id = null;
    wheel.steer = 0;
    wheelEl.classList.remove('active');
    wheelEl.style.left = wheelEl.style.top = '';
    paintWheel();
  }
  if (held.delete(e.pointerId)) paint();
}

function releaseAll() {
  held.clear();
  if (wheel.id !== null) onUp({ pointerId: wheel.id });
  paint();
}

function paint() {
  const on = new Set(held.values());
  root.querySelectorAll('[data-ctl]').forEach((b) => b.classList.toggle('on', on.has(b.dataset.ctl)));
}

function paintWheel() {
  wheelEl.style.setProperty('--r', `${wheel.steer * 120}deg`);
}

// ---------- Inclinar el aparato como un volante ----------
async function enableTilt() {
  if (tiltOn) return true;
  const DOE = window.DeviceOrientationEvent;
  if (!DOE || !window.isSecureContext) {
    tiltMsg = 'Este navegador no deja leer la inclinación (hace falta abrir el juego con https).';
    return false;
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      if ((await DOE.requestPermission()) !== 'granted') throw new Error('denegado');
    } catch {
      tiltMsg = 'Sin permiso para leer la inclinación. Se puede dar en los ajustes de Safari.';
      return false;
    }
  }
  window.addEventListener('deviceorientation', onOrient);
  tiltOn = true;
  tiltMsg = '';
  return true;
}

/**
 * Cuánto está girado el aparato, sostenido acostado: sirve tanto parado (girarlo como un volante)
 * como acostado (bajar un costado). Se usa la gravedad vista desde la pantalla.
 */
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  const b = e.beta * D2R, g = e.gamma * D2R;
  // "arriba" del mundo en ejes del aparato
  const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);
  const a = (screen.orientation?.angle ?? window.orientation ?? 0) * D2R;
  const sx = ux * Math.cos(a) - uy * Math.sin(a); // componente horizontal en la pantalla
  const deg = Math.asin(clamp(-sx, -1, 1)) / D2R;
  const v = Math.max(0, Math.abs(deg) - TOUCH.TILT_DEADZONE) / (TOUCH.TILT_MAX - TOUCH.TILT_DEADZONE);
  const target = Math.sign(deg) * Math.min(1, v);
  tilt += (target - tilt) * 0.5;
}

// ---------- Ajustes (en el menú y en la pausa) ----------
async function onOption(e) {
  const b = e.target.closest('[data-opt]');
  if (!b) return;
  const { opt, val } = b.dataset;
  tiltMsg = '';
  if (opt === 'steer' && val === 'inclinar' && !(await enableTilt())) {
    renderSettings();
    return;
  }
  cfg[opt] = val;
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {}
  applyLayout();
}

function applyLayout() {
  root.classList.remove('mode-volante', 'mode-botones', 'mode-inclinar');
  root.classList.add(`mode-${cfg.steer}`);
  root.classList.toggle('auto', cfg.gas === 'auto');
  root.classList.toggle('swap', cfg.side === 'der');
  // inclinando, el freno pasa al pulgar que no dobla (como en F1 Mobile Racing)
  $('t-brake').classList.toggle('t-a', cfg.steer === 'inclinar');
  $('t-brake').classList.toggle('t-b', cfg.steer !== 'inclinar');
  releaseAll();
  renderSettings();
}

function renderSettings() {
  const html = OPTIONS.map(
    (o) => `<div class="t-opt"><span>${o.label}</span><div class="seg" role="group" aria-label="${o.label}">${Object.entries(o.values)
      .map(([v, name]) => `<button type="button" data-opt="${o.key}" data-val="${v}" aria-pressed="${cfg[o.key] === v}">${name}</button>`)
      .join('')}</div></div>`,
  ).join('');
  const desc = tiltMsg || describe();
  document.querySelectorAll('.t-settings').forEach((el) => {
    el.innerHTML = `${html}<p class="t-desc${tiltMsg ? ' warn' : ''}">${desc}</p>`;
  });
}

function describe() {
  const [a, b] = cfg.side === 'izq' ? ['izquierdo', 'derecho'] : ['derecho', 'izquierdo'];
  const auto = cfg.gas === 'auto';
  if (cfg.steer === 'inclinar') {
    return auto
      ? `Girá el aparato como un volante. El auto acelera solo: frená con el pulgar ${a}.`
      : `Girá el aparato como un volante. Pulgar ${a}: freno. Pulgar ${b}: acelerador.`;
  }
  const steer = cfg.steer === 'volante' ? 'apoyá y deslizá a los costados para doblar' : 'botones ◀ ▶ para doblar';
  return `Pulgar ${a}: ${steer}. Pulgar ${b}: ${auto ? 'el auto acelera solo, vos frenás' : 'acelerador y freno'}.`;
}
