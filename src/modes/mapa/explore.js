// Andar por el mapa grande: juntar monedas, ver el minimapa y entrar a los lugares.
import { MAPA } from '../../config.js';
import { wallet } from './wallet.js';
import { coinSound } from '../../core/audio.js';

const $ = (id) => document.getElementById(id);

export function createExplore(m) {
  const promptEl = $('map-prompt');
  const mapEl = $('map-mini');
  const ctx = mapEl.getContext('2d');
  let near = null;      // entrada a la que estás cerca
  let safe = null;      // último lugar en tierra firme (para volver si caés al mar)
  let safeT = 0;
  const respawns = [];  // [moneda, segundos que faltan]

  // ---- Minimapa: el mapa entero dibujado una vez, encima el auto ----
  const SIZE = 200;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  mapEl.style.width = mapEl.style.height = `${SIZE}px`;
  mapEl.width = mapEl.height = SIZE * dpr;
  const S = mapEl.width;
  const { x0, x1, z0, z1 } = m.bounds;
  const scale = S / Math.max(x1 - x0, z1 - z0);
  const mx = (x) => (x - x0) * scale, mz = (z) => (z - z0) * scale;
  const base = document.createElement('canvas');
  base.width = base.height = S;
  drawBase(base.getContext('2d'));

  function drawBase(g) {
    g.fillStyle = '#4c7a3a';
    g.fillRect(0, 0, S, S);
    // mar
    g.fillStyle = '#2b78a8';
    g.beginPath();
    g.moveTo(0, S);
    for (let x = x0; x <= x1; x += 40) g.lineTo(mx(x), mz(m.shoreZ(x)));
    g.lineTo(S, S);
    g.fill();
    // playa
    g.strokeStyle = '#e2d3a3';
    g.lineWidth = 3 * dpr;
    g.beginPath();
    for (let x = x0; x <= x1; x += 40) g.lineTo(mx(x), mz(m.shoreZ(x) - 40));
    g.stroke();
    // cerros
    for (const c of m.mountains) {
      const gr = g.createRadialGradient(mx(c.x), mz(c.z), 0, mx(c.x), mz(c.z), c.r * scale);
      gr.addColorStop(0, c.h > 250 ? '#f4f6f8' : '#9a8a6a');
      gr.addColorStop(0.35, '#7d6d50');
      gr.addColorStop(1, 'rgba(76,122,58,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(mx(c.x), mz(c.z), c.r * scale, 0, Math.PI * 2);
      g.fill();
    }
    // ciudad
    g.fillStyle = '#b9b5ac';
    g.fillRect(mx(m.city.x0), mz(m.city.z0), (m.city.x1 - m.city.x0) * scale, (m.city.z1 - m.city.z0) * scale);
    // rutas
    for (const r of m.roads) {
      g.strokeStyle = r.surface === 'tierra' ? '#a07c55' : '#2d2f33';
      g.lineWidth = (r.surface === 'tierra' ? 1.5 : 2.2) * dpr;
      g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo(mx(p.x), mz(p.z)) : g.moveTo(mx(p.x), mz(p.z))));
      g.stroke();
    }
    // entradas
    for (const gt of m.gates) {
      g.fillStyle = `#${gt.color.toString(16).padStart(6, '0')}`;
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.arc(mx(gt.x), mz(gt.z), 5 * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  function drawCar(pos, yaw) {
    ctx.drawImage(base, 0, 0);
    ctx.save();
    ctx.translate(mx(pos.x), mz(pos.z));
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(8 * dpr, 0);
    ctx.lineTo(-5 * dpr, -5 * dpr);
    ctx.lineTo(-2 * dpr, 0);
    ctx.lineTo(-5 * dpr, 5 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return {
    get near() {
      return near;
    },
    show(on) {
      document.body.classList.toggle('mapa', on);
      if (!on) promptEl.hidden = true;
    },
    /** Devuelve un lugar { x, y, z, yaw } si hay que sacar el auto del agua. */
    update(dt, vehicle, yaw) {
      const t = vehicle.body.translation();
      // monedas
      for (const c of m.coins) {
        if (c.taken) continue;
        const dx = c.x - t.x, dy = c.y - t.y, dz = c.z - t.z;
        const r = c.big ? 5 : 3.2;
        if (dx * dx + dy * dy + dz * dz < r * r) {
          c.taken = true;
          wallet.add(c.value);
          coinSound(c.big);
          respawns.push([c, MAPA.COIN_RESPAWN]);
        }
      }
      for (let i = respawns.length - 1; i >= 0; i--) {
        if ((respawns[i][1] -= dt) > 0) continue;
        respawns[i][0].taken = false;
        respawns.splice(i, 1);
      }
      // entradas
      near = null;
      for (const g of m.gates) {
        if (Math.hypot(g.x - t.x, g.z - t.z) < MAPA.PORTAL_RADIUS && Math.abs(g.y - t.y) < 6) near = g;
      }
      if (near) {
        const label = near.place === 'tienda' ? 'Entrar a la tienda' : `Ir a: ${near.title}`;
        promptEl.innerHTML = `<b>${label}</b><small>${document.body.classList.contains('touch') ? 'Tocá acá' : 'Apretá Enter'}</small>`;
      }
      promptEl.hidden = !near;
      drawCar(t, yaw);
      // agua: si te metés en el mar, volvés a la orilla
      if (vehicle.wheelsOnGround && t.y > 0.8) {
        if ((safeT += dt) > 1) {
          safeT = 0;
          safe = { x: t.x, y: t.y + 1, z: t.z, yaw };
        }
      }
      if (t.y < -0.8) {
        // volvés a la orilla mirando para el lado de la tierra (al norte)
        const back = safe ? { ...safe, yaw: Math.PI / 2 } : m.spawn;
        safe = null;
        return back;
      }
      return null;
    },
  };
}
