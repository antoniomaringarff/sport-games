// Teclado + joystick. Devuelve lo que el auto necesita: acelerar, frenar, doblar, freno de mano.
const down = new Set();
const pressed = new Set(); // teclas recién apretadas (para acciones de una vez)

const CODES_BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];

window.addEventListener('keydown', (e) => {
  if (CODES_BLOCK.includes(e.code)) e.preventDefault();
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => down.clear());

const any = (...codes) => codes.some((c) => down.has(c));

let padPrev = [];

/** Lee el estado de manejo de este cuadro. */
export function readDriving() {
  let throttle = any('KeyW', 'ArrowUp') ? 1 : 0;
  let brake = any('KeyS', 'ArrowDown') ? 1 : 0;
  let steer = (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0);
  let handbrake = any('Space');

  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const ax = pad.axes[0] ?? 0;
    if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88);
    throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
    brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
    handbrake ||= !!pad.buttons[0]?.pressed;
    pad.buttons.forEach((b, i) => {
      if (b.pressed && !padPrev[i]) pressed.add(`Pad${i}`);
    });
    padPrev = pad.buttons.map((b) => b.pressed);
  }
  return { throttle, brake, steer, handbrake };
}

/** ¿Se apretó esta tecla desde la última vez que se preguntó? */
export function justPressed(...codes) {
  let hit = false;
  for (const c of codes) {
    if (pressed.has(c)) {
      pressed.delete(c);
      hit = true;
    }
  }
  return hit;
}

export function clearPressed() {
  pressed.clear();
}
