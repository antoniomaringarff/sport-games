// Tienda de autos del mapa: ver los autos inventados, comprarlos con monedas y salir manejando.
import { CARS } from '../../config.js';
import { wallet } from './wallet.js';
import { beep } from '../../core/audio.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** onHighlight(id): mostrar ese auto en 3D · onUse(id): salir de la tienda con ese auto · onExit() */
export function createShop({ onHighlight, onUse, onExit }) {
  const root = $('shop');
  const list = $('shop-cards');
  const coinsEl = $('shop-coins');
  const msgEl = $('shop-msg');
  const ids = Object.keys(CARS).filter((id) => CARS[id].price);
  let index = 0;
  let msgTimer = null;

  list.innerHTML = '';
  ids.forEach((id, i) => {
    const c = CARS[id];
    const card = document.createElement('div');
    card.className = 'card shop-card';
    card.style.setProperty('--car', hex(c.color));
    card.innerHTML = `
      <h2>${c.name}</h2>
      ${Object.entries(c.stats)
        .map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${v}"></i></div>`)
        .join('')}
      <button type="button" class="buy" data-buy></button>`;
    card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && set(i));
    card.addEventListener('click', (e) => {
      set(i);
      if (e.target.closest('[data-buy]')) act();
    });
    list.appendChild(card);
  });
  $('shop-exit').addEventListener('click', () => onExit());

  function render() {
    coinsEl.textContent = wallet.coins;
    [...list.children].forEach((card, k) => {
      const id = ids[k];
      const owned = wallet.owns(id);
      const btn = card.querySelector('[data-buy]');
      card.classList.toggle('active', k === index);
      card.classList.toggle('owned', owned);
      btn.innerHTML = owned ? 'Manejar' : `Comprar · 🪙 ${CARS[id].price}`;
      btn.disabled = !owned && wallet.coins < CARS[id].price;
    });
  }

  function say(text) {
    msgEl.textContent = text;
    msgEl.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (msgEl.hidden = true), 2500);
  }

  function set(i) {
    index = (i + ids.length) % ids.length;
    render();
    onHighlight(ids[index]);
  }

  /** Enter o el botón: comprar, o si ya es tuyo, salir manejándolo. */
  function act() {
    const id = ids[index];
    if (wallet.owns(id)) return onUse(id);
    if (wallet.buy(id)) {
      beep(880, 0.12, 0.2);
      setTimeout(() => beep(1320, 0.2, 0.2), 120);
      say(`¡Compraste el ${CARS[id].name}! Tocá "Manejar" para salir con él.`);
    } else {
      beep(220, 0.25, 0.2);
      say(`Te faltan 🪙 ${CARS[id].price - wallet.coins}. Juntá monedas en el mapa o ganá carreras.`);
    }
    render();
  }

  return {
    get visible() {
      return !root.hidden;
    },
    open() {
      root.hidden = false;
      msgEl.hidden = true;
      set(index);
    },
    close() {
      root.hidden = true;
    },
    move(d) {
      set(index + d);
    },
    act,
  };
}
