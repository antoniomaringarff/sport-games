// Física de un auto: chasis + 4 ruedas con el controlador de vehículo de Rapier.
// Sin gráficos (los dibuja carModel.js). Ejes del auto: +X adelante, +Y arriba, +Z derecha.
import { SURFACES, ASSISTS, WALL } from '../../config.js';

const FL = 0, FR = 1, RL = 2, RR = 3;
const KMH = 3.6;

export class Vehicle {
  /**
   * @param physics  objeto de createPhysics()
   * @param profile  un auto de CARS (config.js)
   * @param spawn    { x, y, z, yaw }
   */
  constructor(physics, profile, spawn) {
    this.physics = physics;
    this.p = profile;
    const { RAPIER, world } = physics;
    const p = profile;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation(yawQuat(spawn.yaw ?? 0))
      .setLinearDamping(0.02)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const hx = p.LENGTH / 2, hy = p.HEIGHT / 2, hz = p.WIDTH / 2;
    // Masa con centro bajo: así vuelca menos y se siente "plantado"
    const m = p.MASS;
    const inertia = {
      x: (m / 12) * (p.HEIGHT ** 2 + p.WIDTH ** 2) * 1.4,
      y: (m / 12) * (p.LENGTH ** 2 + p.WIDTH ** 2),
      z: (m / 12) * (p.LENGTH ** 2 + p.HEIGHT ** 2),
    };
    const colDesc = RAPIER.ColliderDesc.roundCuboid(hx - 0.1, hy - 0.1, hz - 0.1, 0.1)
      .setMassProperties(m, { x: 0, y: p.CENTER_OF_MASS_Y, z: 0 }, inertia, { w: 1, x: 0, y: 0, z: 0 })
      .setFriction(0.4)
      .setRestitution(0.15);
    this.collider = world.createCollider(colDesc, this.body);

    // ---- Ruedas ----
    this.ctrl = world.createVehicleController(this.body);
    const sag = PHYSICS_G / (4 * p.SUSPENSION_STIFFNESS); // cuánto se hunde quieto
    this.restLength = p.SUSPENSION_TRAVEL + sag;
    if (p.WHEELS) {
      // Ruedas donde las tiene el modelo 3D (posición en reposo)
      this.wheelPos = p.WHEELS.map((w) => ({ x: w.x, y: w.y + p.SUSPENSION_TRAVEL, z: w.z }));
    } else {
      const wheelCenterY = -hy - p.RIDE_HEIGHT + p.WHEEL_RADIUS;
      const connY = wheelCenterY + p.SUSPENSION_TRAVEL;
      const ax = p.WHEELBASE / 2, az = p.TRACK / 2;
      this.wheelPos = [
        { x: ax, y: connY, z: -az }, // FL
        { x: ax, y: connY, z: az },  // FR
        { x: -ax, y: connY, z: -az }, // RL
        { x: -ax, y: connY, z: az },  // RR
      ];
    }
    for (const wp of this.wheelPos) {
      this.ctrl.addWheel(wp, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, this.restLength, p.WHEEL_RADIUS);
    }
    const damp = p.SUSPENSION_DAMPING;
    for (let i = 0; i < 4; i++) {
      this.ctrl.setWheelSuspensionStiffness(i, p.SUSPENSION_STIFFNESS);
      this.ctrl.setWheelSuspensionCompression(i, damp);
      this.ctrl.setWheelSuspensionRelaxation(i, damp * 0.85);
      this.ctrl.setWheelMaxSuspensionTravel(i, p.SUSPENSION_TRAVEL * 1.5);
      this.ctrl.setWheelMaxSuspensionForce(i, 1e6);
      this.ctrl.setWheelFrictionSlip(i, p.GRIP);
      this.ctrl.setWheelSideFrictionStiffness(i, p.SIDE_GRIP);
    }

    this.driven = p.DRIVE === 'all' ? [FL, FR, RL, RR] : p.DRIVE === 'front' ? [FL, FR] : [RL, RR];
    this.steer = 0;            // -1..1 suavizado
    this.speed = 0;            // m/s, con signo (adelante +)
    this.surface = 'asfalto';
    this.wheelSurface = ['asfalto', 'asfalto', 'asfalto', 'asfalto'];
    this.wheelsOnGround = 4;
    this.upsideDownTime = 0;
    this.skid = [0, 0, 0, 0];  // 0..1 cuánto patina cada rueda (para efectos)
    this.spawn = { ...spawn };
    // golpes contra paredes (para chispas y cámara)
    this.impact = 0;          // m/s de golpe de frente en este paso (0 = nada)
    this.scrape = 0;          // m/s raspando a lo largo de la pared
    this.contactPoint = null; // dónde toca la pared
  }

  get kmh() {
    return Math.abs(this.speed) * KMH;
  }

  /** input: { throttle 0..1, brake 0..1, steer -1..1 (der +), handbrake bool } */
  update(input, dt) {
    const p = this.p;
    const ctrl = this.ctrl;
    const body = this.body;

    // Guarda: en pruebas largas del rally el cuerpo apareció deshabilitado (sin causa encontrada
    // todavía) y el auto quedaba flotando. Si pasa, se reactiva y se avisa en la consola.
    if (!body.isEnabled()) {
      console.warn('[vehicle] cuerpo deshabilitado: se reactiva');
      body.setEnabled(true);
    }

    // Volver a empezar las fuerzas del paso anterior (downforce, ayudas)
    body.resetForces(true);
    body.resetTorques(true);

    const speed = ctrl.currentVehicleSpeed();
    this.speed = speed;
    const absSpeed = Math.abs(speed);
    const vmax = p.TOP_SPEED / KMH;
    const speedFrac = Math.min(absSpeed / vmax, 1);

    // ---- Dirección: suave, y dobla menos a alta velocidad ----
    const target = clamp(input.steer, -1, 1);
    const rate = (Math.sign(target) !== Math.sign(this.steer) || target === 0 ? 1.8 : 1) * p.STEER_SPEED;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const maxAngle = lerp(p.MAX_STEER, p.STEER_AT_SPEED, Math.pow(speedFrac, 0.6));
    const angle = -this.steer * maxAngle; // ángulo + gira a la izquierda en Rapier
    ctrl.setWheelSteering(FL, angle);
    ctrl.setWheelSteering(FR, angle);

    // ---- Acelerar / frenar / marcha atrás ----
    let engine = 0;
    let brake = 0; // m/s²
    const throttle = input.throttle, brakeIn = input.brake;
    if (throttle > 0 && speed > -1) {
      engine = p.ENGINE_FORCE * throttle * Math.max(0, 1 - Math.pow(speedFrac, 2.2));
    } else if (throttle > 0) {
      brake = p.BRAKE * throttle; // venía marcha atrás: primero frena
    }
    if (brakeIn > 0 && speed > 1) {
      brake = Math.max(brake, p.BRAKE * brakeIn);
    } else if (brakeIn > 0 && throttle === 0) {
      const revMax = p.REVERSE_SPEED / KMH;
      engine = -p.ENGINE_FORCE * 0.5 * brakeIn * Math.max(0, 1 - Math.pow(absSpeed / revMax, 2));
      if (speed < -revMax * 1.1) brake = p.BRAKE * 0.5; // va para atrás muy rápido: frena
    }
    if (throttle === 0 && brakeIn === 0) brake = 0.6; // freno motor suave

    const perWheelEngine = engine / this.driven.length;
    // Rapier: el freno es un impulso máximo por rueda en cada paso
    const brakeImpulse = (b) => (p.MASS * b * dt) / 4;
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelEngineForce(i, this.driven.includes(i) ? perWheelEngine : 0);
      ctrl.setWheelBrake(i, brakeImpulse(brake));
    }
    if (input.handbrake) {
      ctrl.setWheelBrake(RL, brakeImpulse(p.HANDBRAKE * 2));
      ctrl.setWheelBrake(RR, brakeImpulse(p.HANDBRAKE * 2));
      ctrl.setWheelEngineForce(RL, 0);
      ctrl.setWheelEngineForce(RR, 0);
    }

    // ---- Agarre según superficie ----
    let surfaceDrag = 0;
    let onGround = 0;
    const counts = {};
    for (let i = 0; i < 4; i++) {
      const s = this.physics.surfaceOf(ctrl.wheelGroundObject(i)) ?? this.wheelSurface[i];
      this.wheelSurface[i] = s;
      const surf = SURFACES[s] ?? SURFACES.asfalto;
      const off = p.OFFROAD[s] ?? 1;
      let grip = p.GRIP * surf.grip * off;
      let side = p.SIDE_GRIP;
      if (input.handbrake && (i === RL || i === RR)) {
        grip *= p.REAR_GRIP_HANDBRAKE;
        side *= p.REAR_GRIP_HANDBRAKE;
      }
      ctrl.setWheelFrictionSlip(i, grip);
      ctrl.setWheelSideFrictionStiffness(i, side);
      if (ctrl.wheelIsInContact(i)) {
        onGround++;
        surfaceDrag += (surf.drag / Math.sqrt(Math.max(off, 0.3))) / 4;
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    this.wheelsOnGround = onGround;
    if (onGround) this.surface = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    // ---- Fuerzas extra sobre el chasis ----
    const lv = body.linvel();
    const rot = body.rotation();
    const up = rotateVec(rot, { x: 0, y: 1, z: 0 });
    const fwd = rotateVec(rot, { x: 1, y: 0, z: 0 });
    const right = rotateVec(rot, { x: 0, y: 0, z: 1 });

    // Downforce (aerodinámica): empuja contra el piso, más a más velocidad
    if (p.DOWNFORCE > 0 && onGround > 0) {
      const f = p.DOWNFORCE * speed * speed * p.MASS;
      body.addForce({ x: -up.x * f, y: -up.y * f, z: -up.z * f }, true);
    }
    // Arrastre de la superficie (arena, pasto, tierra frenan)
    if (surfaceDrag > 0 && absSpeed > 0.1) {
      // crece con la velocidad: en arena se puede andar, pero no rápido
      const a = Math.min(surfaceDrag * (absSpeed / 10), 8) * p.MASS;
      const inv = 1 / Math.hypot(lv.x, lv.y, lv.z);
      body.addForce({ x: -lv.x * inv * a, y: -lv.y * inv * a, z: -lv.z * inv * a }, true);
    }

    const av = body.angvel();
    if (onGround >= 2 && ASSISTS.ANTI_FLIP) {
      // Anti-vuelco: frena la inclinación de costado
      const rollRate = av.x * fwd.x + av.y * fwd.y + av.z * fwd.z;
      const rollAngle = Math.asin(clamp(right.y, -1, 1)); // + si el lado derecho sube
      const k = p.ANTI_ROLL * p.MASS;
      const t = (rollAngle * 6 - rollRate * 1.5) * k * 0.6;
      body.addTorque({ x: fwd.x * t, y: fwd.y * t, z: fwd.z * t }, true);
    } else if (onGround === 0 && ASSISTS.AIR_CONTROL > 0) {
      // En el aire: se endereza solo, de a poco
      const axis = cross(up, { x: 0, y: 1, z: 0 });
      const k = ASSISTS.AIR_CONTROL * p.MASS * 2.5;
      body.addTorque({
        x: axis.x * k - av.x * k * 0.25,
        y: -av.y * k * 0.1,
        z: axis.z * k - av.z * k * 0.25,
      }, true);
    }

    // ---- Paredes: golpe suave y realista en vez de rebote ----
    this.handleWalls(dt);

    // ---- Si quedó dado vuelta, se reubica solo ----
    if (up.y < 0.3 && absSpeed < 3) this.upsideDownTime += dt;
    else this.upsideDownTime = 0;
    if (this.upsideDownTime > ASSISTS.AUTO_RESET_SECONDS) this.reset();

    ctrl.updateVehicle(dt);

    // Cuánto patina cada rueda (para humo / marcas / sonido)
    for (let i = 0; i < 4; i++) {
      const side = Math.abs(ctrl.wheelSideImpulse(i) ?? 0);
      const fwdI = Math.abs(ctrl.wheelForwardImpulse(i) ?? 0);
      const lat = Math.abs(lv.x * right.x + lv.z * right.z);
      this.skid[i] = ctrl.wheelIsInContact(i) ? clamp((lat - 2.5) / 6, 0, 1) : 0;
      void side; void fwdI;
    }
  }

  /** Busca si el chasis toca una pared. Devuelve { n (normal hacia afuera de la pared), point } o null. */
  wallContact() {
    const { world } = this.physics;
    const pos = this.body.translation();
    let found = null;
    world.contactPairsWith(this.collider, (other) => {
      if (found || !this.physics.isWall(other)) return;
      world.contactPair(this.collider, other, (m) => {
        if (found || m.numContacts() === 0 || m.contactDist(0) > 0.15) return;
        const raw = m.normal();
        let nx = raw.x, nz = raw.z;
        const l = Math.hypot(nx, nz);
        if (l < 0.3) return; // contacto de arriba/abajo, no es un costado
        nx /= l; nz /= l;
        // que apunte desde la pared hacia el auto (la pared está a lo lejos en la otra dirección)
        const probe = Math.max(this.p.LENGTH, this.p.WIDTH);
        const wallSide = this.physics.world.castRay(
          new this.physics.RAPIER.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: -nx, y: 0, z: -nz }), probe, true,
          undefined, undefined, this.collider);
        if (!wallSide || wallSide.collider.handle !== other.handle) { nx = -nx; nz = -nz; }
        const half = this.p.WIDTH / 2;
        const p = { x: pos.x - nx * half, y: pos.y - this.p.HEIGHT * 0.2, z: pos.z - nz * half };
        found = { n: { x: nx, z: nz }, point: { x: p.x, y: p.y, z: p.z } };
      });
    });
    return found;
  }

  handleWalls(dt) {
    this.impact = 0;
    this.scrape = 0;
    // velocidades de los últimos pasos (la física frena el golpe antes de que veamos el contacto)
    const v = this.body.linvel();
    this.velHist = this.velHist ?? [];
    this.velHist.push({ x: v.x, z: v.z });
    if (this.velHist.length > 5) this.velHist.shift();
    const wc = this.wallContact();
    this.contactPoint = wc?.point ?? null;
    const wasTouching = this.touching;
    this.touching = !!wc;
    if (!wc) return;
    const body = this.body;
    const { n } = wc;
    // qué tan de frente venía contra la pared (la física ya frenó esa parte)
    let hitNow = 0;
    for (const h of this.velHist) hitNow = Math.max(hitNow, -(h.x * n.x + h.z * n.z));
    const vn = v.x * n.x + v.z * n.z;
    let tx = v.x - n.x * vn, tz = v.z - n.z * vn;
    let out = Math.max(vn, 0);
    let keep = 1 - WALL.SCRAPE * dt;
    if (!wasTouching) {
      // golpe: se pierde más velocidad cuanto más de frente
      keep = Math.max(0.35, 1 - hitNow * WALL.HIT_LOSS);
      out = Math.max(out, Math.min(hitNow * WALL.BOUNCE, 2));
      this.impact = hitNow;
    }
    tx *= keep;
    tz *= keep;
    body.setLinvel({ x: tx + n.x * out, y: Math.min(v.y, 1), z: tz + n.z * out }, true);
    this.scrape = Math.hypot(tx, tz);

    // El auto se acomoda paralelo a la pared y no sale girando como trompo
    const f = rotateVec(body.rotation(), { x: 1, y: 0, z: 0 });
    let dx = -n.z, dz = n.x; // dirección de la pared
    if (dx * f.x + dz * f.z < 0) { dx = -dx; dz = -dz; }
    let d = Math.atan2(-dz, dx) - Math.atan2(-f.z, f.x);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const av = body.angvel();
    const want = Math.abs(d) < 1.1 ? d * WALL.ALIGN : av.y * 0.5;
    body.setAngvel({ x: av.x * 0.6, y: av.y + (want - av.y) * 0.25, z: av.z * 0.6 }, true);
  }

  /** Reubica el auto: derecho, quieto, 1.5 m más arriba. */
  reset(toSpawn = false) {
    const body = this.body;
    let pos = body.translation();
    let yaw = yawOf(body.rotation());
    if (toSpawn) {
      pos = this.spawn;
      yaw = this.spawn.yaw ?? 0;
    }
    body.setTranslation({ x: pos.x, y: pos.y + 1.5, z: pos.z }, true);
    body.setRotation(yawQuat(yaw), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.upsideDownTime = 0;
  }

  /** Lleva el auto a un lugar exacto { x, y, z, yaw }, quieto. */
  teleport(at) {
    const body = this.body;
    body.setTranslation({ x: at.x, y: at.y, z: at.z }, true);
    body.setRotation(yawQuat(at.yaw ?? 0), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.upsideDownTime = 0;
    this.velHist = [];
    this.touching = false;
  }

  /** Estado de una rueda en coordenadas del chasis (para dibujarla). */
  wheelState(i) {
    const c = this.wheelPos[i];
    const len = this.ctrl.wheelSuspensionLength(i) ?? this.restLength;
    return {
      x: c.x,
      y: c.y - len,
      z: c.z,
      steering: this.ctrl.wheelSteering(i) ?? 0,
      rotation: this.ctrl.wheelRotation(i) ?? 0,
    };
  }

  dispose() {
    const w = this.physics.world;
    w.removeVehicleController(this.ctrl);
    w.removeRigidBody(this.body);
  }
}

const PHYSICS_G = 9.81;

// ---------- utilidades de matemática (sin Three.js) ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
export function yawQuat(yaw) {
  return { w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 };
}
export function rotateVec(q, v) {
  // v' = q * v * q^-1
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
export function yawOf(q) {
  const f = rotateVec(q, { x: 1, y: 0, z: 0 });
  return Math.atan2(-f.z, f.x);
}
