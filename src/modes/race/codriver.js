// Copiloto: arma las "notas de ruta" a partir de las curvas de la pista y las dice en voz alta
// (Web Speech, en español) unos segundos antes de cada curva, como en el rally de verdad.
//   "derecha 3", "izquierda 2 larga", "horquilla derecha", "izquierda 4 y derecha 3", "llegada, a fondo"
import { COPILOT } from '../../config.js';

// Grado según el radio más cerrado de la curva (1 = muy cerrada, 6 = casi recta)
const GRADES = [
  { maxR: 16, say: 'horquilla' },
  { maxR: 28, grade: 1 },
  { maxR: 42, grade: 2 },
  { maxR: 60, grade: 3 },
  { maxR: 85, grade: 4 },
  { maxR: 120, grade: 5 },
  { maxR: 170, grade: 6 },
];

let voiceOn = true;
export function toggleCodriverVoice() {
  voiceOn = !voiceOn;
  if (!voiceOn) window.speechSynthesis?.cancel();
  return voiceOn;
}

/** Notas de ruta de toda la pista: [{ from, to, text }] en orden. */
export function paceNotes(track, finishIdx = null) {
  const n = track.n, k = track.curvature, step = track.step;
  const closed = track.closed !== false;
  const TH = 1 / 170;
  // 1) tramos con curva (lado, radio más cerrado)
  const segs = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(k[i]) <= TH) continue;
    const dir = Math.sign(k[i]);
    let j = i, maxC = 0;
    while (j < n && Math.abs(k[j]) > TH * 0.6 && Math.sign(k[j]) === dir) {
      maxC = Math.max(maxC, Math.abs(k[j]));
      j++;
    }
    segs.push({ from: i, to: j - 1, dir, maxC });
    i = j;
  }
  // 2) juntar tramos del mismo lado casi pegados (una sola curva que "respira")
  const merged = [];
  for (const sgm of segs) {
    const last = merged[merged.length - 1];
    if (last && last.dir === sgm.dir && (sgm.from - last.to) * step < COPILOT.CHAIN) {
      last.to = sgm.to;
      last.maxC = Math.max(last.maxC, sgm.maxC);
    } else merged.push({ ...sgm });
  }
  // 3) texto de cada curva
  const raw = [];
  for (const c of merged) {
    const lenM = (c.to - c.from + 1) * step;
    const g = GRADES.find((x) => 1 / c.maxC <= x.maxR);
    if (!g || lenM < 8) continue;
    const side = c.dir > 0 ? 'derecha' : 'izquierda';
    let text = g.say ? `${g.say} ${side}` : `${side} ${g.grade}`;
    if (!g.say && lenM > 70) text += ' larga';
    raw.push({ from: c.from, to: c.to, text });
  }
  // encadenar curvas muy seguidas: "izquierda 4 y derecha 3"
  const notes = [];
  for (let a = 0; a < raw.length; a++) {
    const note = { ...raw[a] };
    while (a + 1 < raw.length && (raw[a + 1].from - raw[a].to) * step < COPILOT.CHAIN) {
      a++;
      note.text += ` y ${raw[a].text}`;
      note.to = raw[a].to;
    }
    notes.push(note);
  }
  if (finishIdx != null) notes.push({ from: finishIdx, to: finishIdx, text: 'llegada, ¡a fondo!' });
  return { notes, closed, n };
}

/** Copiloto en marcha: llamá update(idx, velocidad) en cada cuadro de la carrera. */
export function createCodriver(track, { enabled = true, finishIdx = null } = {}) {
  const { notes, closed, n } = paceNotes(track, finishIdx);
  const said = new Set();
  const synth = window.speechSynthesis;
  let voice = null;
  const pickVoice = () => {
    const vs = synth?.getVoices() ?? [];
    voice = vs.find((v) => /^es-(AR|419|MX|US)/i.test(v.lang)) ?? vs.find((v) => /^es/i.test(v.lang)) ?? null;
  };
  pickVoice();
  synth?.addEventListener?.('voiceschanged', pickVoice);
  const log = []; // para depurar: lo que fue diciendo

  function speak(text) {
    log.push(text);
    if (!enabled || !voiceOn || !synth) return;
    // si se atrasó, que no se acumulen notas viejas
    if (synth.pending || synth.speaking) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'es-ES';
    if (voice) u.voice = voice;
    u.rate = COPILOT.RATE;
    u.volume = COPILOT.VOLUME;
    synth.speak(u);
  }

  return {
    notes,
    log,
    reset() {
      said.clear();
      log.length = 0;
      synth?.cancel();
    },
    /** idx: punto de la pista donde va el auto; speed en m/s */
    update(idx, speed) {
      const ahead = Math.max(COPILOT.MIN_DISTANCE, speed * COPILOT.SECONDS_AHEAD);
      for (let i = 0; i < notes.length; i++) {
        if (said.has(i)) continue;
        const d = closed ? ((notes[i].from - idx + n) % n) * track.step : (notes[i].from - idx) * track.step;
        if (d < 0 || d > ahead) continue;
        said.add(i);
        speak(notes[i].text);
        break; // una por vez
      }
      // en circuito: al pasar la línea se vuelven a cantar
      if (closed && idx < 5 && said.size > 2) said.clear();
    },
  };
}
