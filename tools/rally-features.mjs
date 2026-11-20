// Lo que hace "de rally" a un camino: no es liso.
//  - tramos de tierra (más suaves) y tramos de piedra (más saltones, con piedras sueltas)
//  - ondulaciones chicas todo el tiempo
//  - lomas en las rectas que hacen volar el auto si venís rápido, y algún pozo
// Se aplica al perfil de alturas del camino ANTES de tallar el terreno, así el relieve
// acompaña las lomas. Todo con una semilla fija: siempre sale igual.

export function roadFeatures(ys, curv, step, seed = 1) {
  const rnd = mulberry(seed);
  const N = ys.length;
  const out = ys.slice();

  // --- tramos de tierra / piedra ---
  const surfaces = [];
  let i = 0, kind = rnd() < 0.5 ? 'tierra' : 'ripio';
  while (i < N - 1) {
    const len = Math.round((180 + rnd() * 340) / step);
    const j = Math.min(N - 1, i + len);
    surfaces.push([i, j, kind]);
    i = j;
    kind = kind === 'tierra' ? 'ripio' : 'tierra';
  }
  const rough = new Float32Array(N);
  for (const [a, b, k] of surfaces) for (let p = a; p <= b; p++) rough[p] = k === 'ripio' ? 1.35 : 0.55;
  // pasar suave de un tramo al otro
  const r2 = rough.slice();
  for (let p = 0; p < N; p++) {
    let s = 0, c = 0;
    for (let q = Math.max(0, p - 10); q <= Math.min(N - 1, p + 10); q++) { s += rough[q]; c++; }
    r2[p] = s / c;
  }

  // --- ondulaciones chicas (no se notan mirando, sí manejando) ---
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  for (let p = 0; p < N; p++) {
    const s = p * step;
    // las cortas apenas (si no, las ruedas no tocan el piso); las largas dan el "flotar" del rally
    out[p] += r2[p] * (0.008 * Math.sin((s / 5.3) * 6.28 + ph[0]) + 0.025 * Math.sin((s / 11) * 6.28 + ph[1])
      + 0.07 * Math.sin((s / 27) * 6.28 + ph[2]) + 0.14 * Math.sin((s / 63) * 6.28 + ph[0] * 1.7));
  }

  // --- lomas (saltos) y pozos, solo donde el camino va bastante derecho ---
  const bumps = [];
  const straight = (p) => {
    const w = Math.round(18 / step);
    for (let q = Math.max(0, p - w); q <= Math.min(N - 1, p + w); q++) if (Math.abs(curv[q]) > 1 / 80) return false;
    return true;
  };
  let s = 160 + rnd() * 120;
  while (s < (N - 1) * step - 120) {
    const p = Math.round(s / step);
    if (straight(p)) {
      const dip = rnd() < 0.2;
      const H = dip ? -(0.45 + rnd() * 0.35) : 0.7 + rnd() * 0.9;
      const L = dip ? 14 + rnd() * 8 : 18 + rnd() * 10;
      const half = Math.round(L / 2 / step);
      for (let q = Math.max(0, p - half); q <= Math.min(N - 1, p + half); q++) {
        const x = ((q - p) * step) / L; // -0.5 .. 0.5
        out[q] += H * 0.5 * (1 + Math.cos(x * 2 * Math.PI));
      }
      bumps.push([p, Math.round(H * 100) / 100, Math.round(L)]);
      s += 110 + rnd() * 170;
    } else {
      s += 20;
    }
  }
  return { ys: out, surfaces, bumps };
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
