// Sonido sintetizado con Web Audio: motor con cambios, derrape, viento, piso, golpes,
// raspón contra el guardrail, eco en el túnel y pitidos del semáforo. Sin archivos.
import { AUDIO } from '../config.js';

let ctx = null;
let master, dry, reverbSend, reverbOut, noiseBuf;
let muted = false;
const listeners = [];

/** El navegador solo deja arrancar el audio después de un clic o una tecla. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : AUDIO.VOLUME;
  // compresor suave para que los golpes no saturen
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  dry = ctx.createGain();
  dry.connect(master);
  // eco (túnel): convolución con una respuesta de ruido que se apaga
  const conv = ctx.createConvolver();
  conv.buffer = impulse(1.6, 2.2);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0;
  reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.9;
  reverbSend.connect(conv).connect(reverbOut).connect(master);
  noiseBuf = makeNoise(2);
  for (const f of listeners.splice(0)) f();
}

export function audioReady() {
  return !!ctx;
}

/** Llama f cuando el audio esté listo (o ya). */
function whenReady(f) {
  if (ctx) f();
  else listeners.push(f);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : AUDIO.VOLUME, ctx.currentTime, 0.05);
  return muted;
}

/** 0 = afuera, 1 = adentro del túnel. */
export function setEcho(amount) {
  if (!ctx) return;
  reverbSend.gain.setTargetAtTime(amount * AUDIO.TUNNEL_ECHO, ctx.currentTime, 0.15);
}

/** Pitido (semáforo). */
export function beep(freq = 660, dur = 0.16, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(dry);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Golpe contra algo: strength en m/s. */
export function impactSound(strength) {
  if (!ctx || strength < 1.5) return;
  const t = ctx.currentTime;
  const v = Math.min(1, strength / 20) * AUDIO.HITS;
  // "pum" grave
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  og.gain.setValueAtTime(v * 0.9, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(og).connect(dry);
  og.connect(reverbSend);
  o.start(t);
  o.stop(t + 0.4);
  // chapa: ruido filtrado
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900 + Math.random() * 600;
  f.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.8, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + v * 0.25);
  n.connect(f).connect(ng).connect(dry);
  ng.connect(reverbSend);
  n.start(t, Math.random());
  n.stop(t + 0.6);
}

// ---------------------------------------------------------------------------

/**
 * Sonidos continuos de un auto (motor, derrape, piso, viento, raspón).
 * Se crea uno por auto; update() en cada cuadro.
 */
export class CarSound {
  constructor(profile) {
    this.p = profile;
    this.s = profile.SOUND;
    this.rpm = this.s.IDLE_RPM;
    this.gear = 1;
    this.shiftT = 0;
    this.nodes = null;
    whenReady(() => this.build());
  }

  build() {
    const s = this.s;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dry);
    out.connect(reverbSend);

    // --- Motor: tres osciladores (fundamental, sub, armónico) + distorsión + filtro ---
    const mix = ctx.createGain();
    const oscs = [
      { type: 'sawtooth', mul: 1, gain: 0.5 },
      { type: 'square', mul: 0.5, gain: 0.35 },
      { type: 'sawtooth', mul: 2.01, gain: 0.18 * s.BRIGHT },
    ].map((d) => {
      const o = ctx.createOscillator();
      o.type = d.type;
      const g = ctx.createGain();
      g.gain.value = d.gain;
      o.connect(g).connect(mix);
      o.start();
      return { o, mul: d.mul };
    });
    // "aspereza": modula el volumen al ritmo de las explosiones
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25 * s.GRIT;
    const am = ctx.createGain();
    am.gain.value = 0.75;
    lfo.connect(lfoGain).connect(am.gain);
    lfo.start();
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortion(10 + s.GRIT * 60);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    mix.connect(am).connect(shaper).connect(lp).connect(engGain).connect(out);

    // --- Ruidos: derrape, piso, viento, raspón ---
    const noise = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(out);
      src.start(0, Math.random() * 2);
      return { f, g };
    };
    const skid = noise('bandpass', 1400, 2.5);
    const ground = noise('lowpass', 240, 0.7);
    const wind = noise('bandpass', 700, 0.4);
    const scrape = noise('bandpass', 3200, 6);

    this.nodes = { out, oscs, lfo, lp, engGain, skid, ground, wind, scrape };
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
  }

  /** Calcula las vueltas del motor con una caja de cambios imaginaria. */
  computeRpm(dt, vehicle, input) {
    const s = this.s;
    const v = Math.abs(vehicle.speed);
    const vmax = this.p.TOP_SPEED / 3.6;
    // velocidad máxima de cada cambio (los primeros más cortos)
    const top = (g) => vmax * Math.pow(g / s.GEARS, 0.75);
    const range = s.MAX_RPM - s.IDLE_RPM;
    const rpmIn = (g) => s.IDLE_RPM * 0.9 + range * Math.min(1.05, v / top(g));
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.shiftT === 0) {
      if (this.gear < s.GEARS && rpmIn(this.gear) > s.MAX_RPM * 0.96 && input.throttle > 0) {
        this.gear++;
        this.shiftT = 0.18; // corte de un instante al pasar el cambio
      } else if (this.gear > 1 && rpmIn(this.gear - 1) < s.MAX_RPM * 0.72) {
        this.gear--;
        this.shiftT = 0.12;
      }
    }
    let target = Math.max(s.IDLE_RPM, rpmIn(this.gear));
    const airborne = vehicle.wheelsOnGround === 0;
    const spinning = input.throttle > 0 && (v < 2 || airborne);
    if (spinning) target = s.IDLE_RPM + range * 0.85 * input.throttle; // acelerando en el lugar o en el aire
    if (this.shiftT > 0.08) target *= 0.82;
    const rate = target > this.rpm ? 9 : 5;
    this.rpm += (target - this.rpm) * Math.min(1, rate * dt);
    return this.rpm;
  }

  update(dt, vehicle, input, extra = {}) {
    const n = this.nodes;
    if (!n) return;
    const t = ctx.currentTime;
    const s = this.s;
    const rpm = this.computeRpm(dt, vehicle, input);
    const f = (rpm / 60) * s.PULSES;
    for (const { o, mul } of n.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.02);
    n.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    const load = Math.max(0.25, input.throttle);
    const rpmFrac = (rpm - s.IDLE_RPM) / (s.MAX_RPM - s.IDLE_RPM);
    n.lp.frequency.setTargetAtTime(400 + (1200 + 3500 * s.BRIGHT) * (0.25 + 0.75 * rpmFrac) * (0.55 + 0.45 * load), t, 0.03);
    const eng = AUDIO.ENGINE * s.VOLUME * (0.35 + 0.65 * load) * (0.6 + 0.4 * rpmFrac);
    n.engGain.gain.setTargetAtTime(this.shiftT > 0.08 ? eng * 0.5 : eng, t, 0.03);

    // derrape: solo en piso duro
    const hard = vehicle.surface === 'asfalto' || vehicle.surface === 'adoquin';
    const skid = Math.max(...vehicle.skid) * (vehicle.wheelsOnGround ? 1 : 0);
    n.skid.g.gain.setTargetAtTime(hard ? skid * AUDIO.SKID : 0, t, 0.05);
    n.skid.f.frequency.setTargetAtTime(1100 + skid * 700, t, 0.05);

    // piso: retumba más en adoquín, tierra, arena
    const kmh = vehicle.kmh;
    const rough = { asfalto: 0.15, adoquin: 0.9, tierra: 0.7, arena: 0.5, nieve: 0.3, pasto: 0.5 }[vehicle.surface] ?? 0.2;
    const groundVol = vehicle.wheelsOnGround ? Math.min(1, kmh / 80) * rough * 0.35 + (!hard ? skid * 0.3 : 0) : 0;
    n.ground.g.gain.setTargetAtTime(groundVol, t, 0.08);

    // viento
    n.wind.g.gain.setTargetAtTime(Math.pow(Math.min(1, kmh / 280), 2) * AUDIO.WIND, t, 0.1);
    n.wind.f.frequency.setTargetAtTime(500 + kmh * 3, t, 0.1);

    // raspón contra el guardrail
    const scr = extra.scrape ?? 0;
    n.scrape.g.gain.setTargetAtTime(scr > 2 ? Math.min(1, scr / 30) * AUDIO.HITS * 0.5 : 0, t, 0.04);
    n.scrape.f.frequency.setTargetAtTime(2400 + Math.min(scr, 40) * 40, t, 0.05);
  }

  /** Silenciar/activar este auto (por ejemplo en el menú). */
  setActive(on) {
    if (this.nodes) this.nodes.out.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08);
  }

  dispose() {
    const n = this.nodes;
    if (!n) {
      this.nodes = null;
      return;
    }
    const t = ctx.currentTime;
    n.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const { o } of n.oscs) o.stop();
      n.lfo.stop();
      n.out.disconnect();
    }, 300);
    this.nodes = null;
  }
}

// ---------------------------------------------------------------------------
function makeNoise(secs) {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function impulse(secs, decay) {
  const len = ctx.sampleRate * secs;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}
function distortion(k) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
