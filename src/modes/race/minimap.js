// Minimapa: la pista vista desde arriba (norte arriba), dónde estás, el tramo que viene
// pintado según qué tan cerrada es la curva, y un cartel con la próxima curva.
import { MINIMAP } from '../../config.js';

// Curvatura + = curva a la derecha (en el sentido de la vuelta)
const KINDS = [
  { maxR: 18, label: 'Horquilla', color: '#ff3b30' },
  { maxR: 35, label: 'Cerrada', color: '#ff7a1a' },
  { maxR: 70, label: 'Media', color: '#ffcc33' },
  { maxR: 140, label: 'Rápida', color: '#9be15d' },
];

export function createMinimap(track) {
  const canvas = document.getElementById('minimap');
  const corner = document.getElementById('next-corner');
  const ctx = canvas.getContext('2d');
  const n = track.n;
  const step = track.step;
  const closed = track.closed !== false;

  // --- Ajustar la pista al cuadro ---
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of track.p) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const cssSize = MINIMAP.SIZE;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = canvas.style.height = `${cssSize}px`;
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  const S = canvas.width;
  const pad = S * 0.09;
  const scale = (S - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (S - (maxX - minX) * scale) / 2, oz = (S - (maxZ - minZ) * scale) / 2;
  const mx = (x) => ox + (x - minX) * scale;
  const mz = (z) => oz + (z - minZ) * scale;

  // --- Curvas: dónde empieza cada una, para qué lado y qué tan cerrada ---
  const corners = findCorners(track, closed);
  const kindAt = new Array(n).fill(null);
  for (const c of corners) for (let k = c.from; ; k = (k + 1) % n) { kindAt[k] = c.kind; if (k === c.to) break; }

  // --- Fondo pre-dibujado (una sola vez) ---
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const b = base.getContext('2d');
  const path = (g, from, len) => {
    g.beginPath();
    for (let j = 0; j <= len; j++) {
      if (!closed && from + j >= n) break;
      const p = track.p[(from + j) % n];
      j ? g.lineTo(mx(p.x), mz(p.z)) : g.moveTo(mx(p.x), mz(p.z));
    }
  };
  b.lineJoin = b.lineCap = 'round';
  path(b, 0, closed ? n : n - 1);
  b.strokeStyle = 'rgba(0,0,0,0.55)';
  b.lineWidth = 9 * dpr;
  b.stroke();
  b.strokeStyle = '#e9edf2';
  b.lineWidth = 4 * dpr;
  b.stroke();
  // túnel en gris
  for (const [a, z] of track.tunnel) {
    path(b, a, (z - a + n) % n);
    b.strokeStyle = '#8b939c';
    b.lineWidth = 4 * dpr;
    b.stroke();
  }
  // línea de largada (y de llegada si es un camino abierto)
  for (const k of closed ? [0] : [0, n - 1]) {
    const p = track.p[k], r = track.r[k];
    b.beginPath();
    b.moveTo(mx(p.x - r.x * 14), mz(p.z - r.z * 14));
    b.lineTo(mx(p.x + r.x * 14), mz(p.z + r.z * 14));
    b.strokeStyle = '#111';
    b.lineWidth = 5 * dpr;
    b.stroke();
    b.strokeStyle = '#fff';
    b.lineWidth = 2 * dpr;
    b.setLineDash([3 * dpr, 3 * dpr]);
    b.stroke();
    b.setLineDash([]);
  }

  let flash = 0;

  return {
    show(v) {
      canvas.hidden = !v;
      corner.hidden = !v;
    },

    /** idx: punto de la pista donde está el auto; pos/fwd del auto. */
    update(dt, idx, pos, fwd) {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(base, 0, 0);
      ctx.lineJoin = ctx.lineCap = 'round';

      // Lo que viene: pintado por tramos según la curva
      const ahead = Math.round(MINIMAP.LOOK_AHEAD / step);
      ctx.lineWidth = 5 * dpr;
      for (let j = 0; j < ahead; j++) {
        if (!closed && idx + j + 1 >= n) break;
        const k = (idx + j) % n, k2 = (k + 1) % n;
        const a = track.p[k], c = track.p[k2];
        ctx.globalAlpha = 1 - j / ahead * 0.6;
        ctx.strokeStyle = kindAt[k]?.color ?? '#4fc3ff';
        ctx.beginPath();
        ctx.moveTo(mx(a.x), mz(a.z));
        ctx.lineTo(mx(c.x), mz(c.z));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // El auto: flecha en la dirección en que mira
      const cx = mx(pos.x), cz = mz(pos.z);
      const ang = Math.atan2(fwd.z, fwd.x);
      ctx.save();
      ctx.translate(cx, cz);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(9 * dpr, 0);
      ctx.lineTo(-6 * dpr, 6 * dpr);
      ctx.lineTo(-3 * dpr, 0);
      ctx.lineTo(-6 * dpr, -6 * dpr);
      ctx.closePath();
      ctx.fillStyle = '#ffcc33';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2 * dpr;
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Cartel de la próxima curva
      let next = null, dist = Infinity;
      for (const c of corners) {
        if (!closed && c.to < idx) continue; // ya pasó
        const d = ((c.from - idx + n) % n) * step;
        const inside = ((idx - c.from + n) % n) <= ((c.to - c.from + n) % n);
        if (inside) { next = c; dist = 0; break; }
        if (d < dist) { dist = d; next = c; }
      }
      if (next && dist <= MINIMAP.WARN_DISTANCE) {
        corner.hidden = false;
        const near = dist < MINIMAP.WARN_CLOSE;
        flash += dt * (near ? 9 : 0);
        corner.style.setProperty('--c', next.kind.color);
        corner.classList.toggle('near', near && Math.sin(flash) > 0);
        corner.querySelector('[data-arrow]').textContent = next.dir > 0 ? '↱' : '↰';
        corner.querySelector('[data-kind]').textContent = `${next.kind.label} a la ${next.dir > 0 ? 'derecha' : 'izquierda'}`;
        corner.querySelector('[data-dist]').textContent = dist === 0 ? 'ahora' : `${Math.round(dist / 10) * 10} m`;
      } else {
        corner.hidden = true;
      }
    },
  };
}

/** Busca las curvas: tramos con curvatura alta, con su lado y su radio más cerrado. */
function findCorners(track, closed = true) {
  const n = track.n, k = track.curvature;
  const TH = 1 / 150;
  const out = [];
  let i = 0;
  // empezar en un punto recto para no partir una curva al medio
  let start = 0;
  while (Math.abs(k[start]) > TH && start < n) start++;
  for (let c = 0; c < n; c++) {
    i = (start + c) % n;
    if (Math.abs(k[i]) <= TH) continue;
    const dir = Math.sign(k[i]);
    let j = i, maxC = 0, len = 0;
    while (len < n && Math.abs(k[j]) > TH * 0.6 && Math.sign(k[j]) === dir && (closed || j >= i)) {
      maxC = Math.max(maxC, Math.abs(k[j]));
      j = (j + 1) % n;
      len++;
    }
    const r = 1 / maxC;
    const kind = KINDS.find((t) => r <= t.maxR);
    if (kind && len * track.step >= 8) out.push({ from: i, to: (i + len - 1) % n, dir, radius: r, kind });
    c += len;
  }
  return out;
}
