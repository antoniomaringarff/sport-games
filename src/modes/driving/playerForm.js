// Pantalla del nombre: es obligatorio para jugar (aparece en los récords y en el multijugador).
import { cleanName, playerName, setPlayerName } from '../../net/player.js';

const $ = (id) => document.getElementById(id);

/** Muestra el formulario hasta que se ponga un nombre válido. Devuelve el nombre. */
export function askName() {
  const root = $('player');
  const form = $('player-form');
  const input = $('player-name');
  const error = $('player-error');
  input.value = playerName() ?? '';
  error.hidden = true;
  root.hidden = false;
  input.focus();
  input.select();

  return new Promise((resolve) => {
    // que escribir no mueva el menú ni el auto
    const stop = (e) => e.stopPropagation();
    input.addEventListener('keydown', stop);
    async function submit(e) {
      e.preventDefault();
      if (!cleanName(input.value)) {
        error.hidden = false;
        input.focus();
        return;
      }
      form.removeEventListener('submit', submit);
      input.removeEventListener('keydown', stop);
      root.hidden = true;
      resolve(await setPlayerName(input.value));
    }
    form.addEventListener('submit', submit);
  });
}
