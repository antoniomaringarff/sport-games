// Backoffice: jugadores (con IP y ciudad), últimos tiempos y ranking. Los datos vienen de /api/backoffice.
import { CARS } from '../config.js';

const $ = (id) => document.getElementById(id);
const PLACE_NAMES = { monaco: 'Mónaco', rally: 'Tête de Chien', condor: 'El Cóndor' };

let data = null;
let tab = 'players';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (ms) => {
  const t = ms / 1000, m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const where = (city, region, country) => [city, region, country].filter(Boolean).map(esc).join(', ') || '—';
const car = (id) => esc(CARS[id]?.name ?? id);

async function load() {
  const res = await fetch('/api/backoffice/data', { cache: 'no-store' });
  if (res.status === 401) return showLogin();
  if (!res.ok) {
    $('content').innerHTML = '<p class="empty">No se pudieron leer los datos. Probá de nuevo.</p>';
    return;
  }
  data = await res.json();
  $('login').hidden = true;
  $('panel').hidden = false;
  render();
}

function showLogin() {
  $('panel').hidden = true;
  $('login').hidden = false;
  $('login-form').user.focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const error = $('login-error');
  error.hidden = true;
  form.querySelector('button').disabled = true;
  const res = await fetch('/api/backoffice/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: form.user.value, password: form.password.value }),
  }).catch(() => null);
  form.querySelector('button').disabled = false;
  if (!res?.ok) {
    error.textContent = res?.status === 401 ? 'Usuario o clave incorrectos.' : 'No se pudo entrar. Probá de nuevo.';
    error.hidden = false;
    return;
  }
  form.password.value = '';
  load();
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/backoffice/logout', { method: 'POST' }).catch(() => {});
  data = null;
  showLogin();
});
$('reload').addEventListener('click', load);
$('search').addEventListener('input', render);
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  for (const x of $('tabs').querySelectorAll('[data-tab]')) x.classList.toggle('active', x === b);
  render();
});

function matches(...fields) {
  const q = $('search').value.trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

function render() {
  if (!data) return;
  const s = data.summary;
  $('summary').innerHTML = `
    <div><b>${s.players}</b><span>jugadores</span></div>
    <div><b>${s.records}</b><span>tiempos guardados</span></div>
    <div><b>${s.recordsToday}</b><span>tiempos en las últimas 24 h</span></div>`;
  $('content').innerHTML = tab === 'players' ? players() : tab === 'records' ? records() : ranking();
}

function table(head, rows, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function players() {
  const rows = data.players
    .filter((p) => matches(p.name, p.last_ip, p.first_ip, p.last_city, p.first_city, p.last_country))
    .map(
      (p) => `<tr>
        <td><b>${esc(p.name)}</b></td>
        <td class="mono">${esc(p.last_ip ?? '—')}</td>
        <td>${where(p.last_city, p.last_region, p.last_country)}</td>
        <td class="num">${p.visits}</td>
        <td>${fmtDate(p.last_seen_at)}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td class="dim">${p.first_ip && p.first_ip !== p.last_ip ? `${esc(p.first_ip)} · ` : ''}${p.first_city !== p.last_city ? where(p.first_city, p.first_region, p.first_country) : ''}</td>
      </tr>`,
    );
  return table(['Nombre', 'IP', 'Ciudad', 'Visitas', 'Última vez', 'Primera vez', 'Primera IP / ciudad (si cambió)'], rows, 'Todavía no hay jugadores.');
}

function records() {
  const rows = data.records
    .filter((r) => matches(r.player_name, r.ip, r.city, r.country, PLACE_NAMES[r.place], CARS[r.car]?.name))
    .map(
      (r) => `<tr>
        <td>${fmtDate(r.created_at)}</td>
        <td><b>${esc(r.player_name)}</b></td>
        <td>${esc(PLACE_NAMES[r.place] ?? r.place)}</td>
        <td>${car(r.car)}</td>
        <td class="num mono">${fmtTime(r.time_ms)}</td>
        <td class="mono">${esc(r.ip ?? '—')}</td>
        <td>${where(r.city, r.region, r.country)}</td>
      </tr>`,
    );
  return table(['Cuándo', 'Jugador', 'Lugar', 'Auto', 'Tiempo', 'IP', 'Ciudad'], rows, 'Todavía no hay tiempos.');
}

function ranking() {
  return Object.entries(data.ranking)
    .map(([place, list]) => {
      const rows = list
        .filter((r) => matches(r.player_name, r.city, r.country))
        .map(
          (r, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td><b>${esc(r.player_name)}</b></td>
            <td>${car(r.car)}</td>
            <td class="num mono">${fmtTime(r.time_ms)}</td>
            <td>${where(r.city, null, r.country)}</td>
            <td>${fmtDate(r.created_at)}</td>
          </tr>`,
        );
      return `<h2>${esc(PLACE_NAMES[place] ?? place)}</h2>${table(['#', 'Jugador', 'Auto', 'Mejor tiempo', 'Ciudad', 'Cuándo'], rows, 'Sin tiempos.')}`;
    })
    .join('');
}

load();
