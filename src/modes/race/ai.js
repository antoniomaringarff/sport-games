// Bots: piloto automático que sigue la pista, frena antes de las curvas y se recupera solo.
// Sirve para los rivales del multijugador (y más adelante para rivales en un jugador).
import { rotateVec } from '../driving/vehicle.js';

/** Sigue en qué parte de la pista va un auto y cuántas veces cruzó la línea. */
export class LapTracker {
  constructor(track, idx) {
    this.track = track;
    this.idx = idx;
    this.crossings = 0;
    this.finishTime = null;
  }
  update(pos) {
    const t = this.track, n = t.n;
    const prev = this.idx;
    let bi = prev, bd = Infinity;
    for (let o = -30; o <= 30; o++) {
      const k = (prev + o + n) % n;
      const p = t.p[k];
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bd) { bd = d; bi = k; }
    }
    this.idx = bi;
    if (prev > n - 60 && bi < 60) this.crossings++;
    else if (prev < 60 && bi > n - 60) this.crossings--;
  }
  /** metros recorridos desde la largada */
  progress() {
    return ((this.crossings - 1) * this.track.n + this.idx) * this.track.step;
  }
}

export class BotDriver {
  /**
   * skill: 0.8 a 1 (qué tan al límite maneja) · lane: metros a un costado del centro
   */
  constructor(vehicle, track, { skill = 0.9, lane = 0, idx = 0 } = {}) {
    this.v = vehicle;
    this.track = track;
    this.skill = skill;
    this.lane = lane;
    this.tracker = new LapTracker(track, idx);
    this.stuck = 0;
    const p = vehicle.p;
    // aceleración lateral y frenada que se anima a usar
    this.aLat = 9.81 * p.GRIP * 0.82 * skill * (p.DOWNFORCE > 0.001 ? 1.2 : 1);
    // frenado real: lo que da la goma (con downforce, más), no lo que pide el pedal
    this.aBrake = Math.min(p.BRAKE, 9.81 * p.GRIP * (p.DOWNFORCE > 0.001 ? 1.6 : 1.05)) * 0.7 * skill;
  }

  input(dt, racing) {
    const v = this.v, t = this.track, n = t.n;
    const pos = v.body.translation();
    this.tracker.update(pos);
    if (!racing) return { throttle: 0, brake: 0, steer: 0, handbrake: true };
    const idx = this.tracker.idx;
    const speed = Math.abs(v.speed);

    // Hacia dónde apuntar: un punto adelante, corrido a su carril
    const look = Math.round(6 + speed * 0.32);
    const k = (idx + look) % n;
    const lane = this.lane * Math.max(0, 1 - Math.abs(t.curvature[k]) * 40); // en curvas, al centro
    const q = t.p[k], r = t.r[k];
    const tx = q.x + r.x * lane, tz = q.z + r.z * lane;
    const f = rotateVec(v.body.rotation(), { x: 1, y: 0, z: 0 });
    let dx = tx - pos.x, dz = tz - pos.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const side = -f.z * dx + f.x * dz; // + = el objetivo está a la derecha
    const steer = Math.max(-1, Math.min(1, side * 2.6));

    // Velocidad a la que puede ir: la curva más exigente dentro de la distancia de frenado
    let target = v.p.TOP_SPEED / 3.6;
    const horizon = Math.round((speed * speed) / (2 * this.aBrake) / t.step) + 10;
    for (let o = 0; o < horizon; o += 2) {
      const c = Math.abs(t.curvature[(idx + o) % n]);
      if (c < 1e-4) continue;
      const vCorner = Math.sqrt(this.aLat / c);
      const dist = o * t.step;
      target = Math.min(target, Math.sqrt(vCorner * vCorner + 2 * this.aBrake * dist));
    }
    let throttle = 0, brake = 0;
    if (speed < target - 1.5) throttle = 1;
    else if (speed > target + 2) brake = Math.min(1, (speed - target) / 8);
    else throttle = 0.4;

    // Trabado (contra una pared, dado vuelta): volver a la pista
    this.stuck = speed < 2 ? this.stuck + dt : 0;
    if (this.stuck > 3) {
      this.stuck = 0;
      const k2 = (idx + 3) % n, p2 = t.p[k2], d2 = t.d[k2];
      v.teleport({ x: p2.x + t.r[k2].x * this.lane, y: p2.y + 1.2, z: p2.z + t.r[k2].z * this.lane, yaw: Math.atan2(-d2.z, d2.x) });
    }
    return { throttle, brake, steer, handbrake: false };
  }
}
