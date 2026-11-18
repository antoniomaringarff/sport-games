// Ayudantes para crear cosas que se ven (Three.js) y se chocan (Rapier) a la vez.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export class WorldBuilder {
  constructor(physics, scene) {
    this.physics = physics;
    this.R = physics.RAPIER;
    this.world = physics.world;
    this.scene = scene;
    this.dynamic = []; // { body, mesh } que hay que sincronizar cada cuadro
  }

  _mesh(geo, mat, pos, quat, { shadow = true } = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    if (quat) mesh.quaternion.copy(quat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _collider(desc, pos, quat, { surface, dynamic = false, mass } = {}) {
    let body = null;
    if (dynamic) {
      const bd = this.R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z);
      if (quat) bd.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      body = this.world.createRigidBody(bd);
      if (mass) desc.setMass(mass);
    } else {
      desc.setTranslation(pos.x, pos.y, pos.z);
      if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    const col = this.world.createCollider(desc, body ?? undefined);
    if (surface) this.physics.setSurface(col, surface);
    return { col, body };
  }

  /** Caja. size = {x,y,z} tamaño completo; rot = Euler en radianes {x,y,z}. */
  box({ size, pos, rot, material, surface, dynamic, mass, friction, shadow }) {
    const quat = rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0)) : null;
    const mesh = this._mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material, pos, quat, { shadow });
    const desc = this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    if (friction != null) desc.setFriction(friction);
    const { body } = this._collider(desc, pos, quat, { surface, dynamic, mass });
    if (body) this.dynamic.push({ body, mesh });
    return mesh;
  }

  /** Superficie plana del piso (parche) con la parte de arriba a la altura `top`. */
  patch({ x, z, w, d, top = 0.03, yaw = 0, material, surface }) {
    const t = 0.2;
    return this.box({
      size: { x: w, y: t, z: d },
      pos: { x, y: top - t / 2, z },
      rot: { y: yaw },
      material,
      surface,
      shadow: false,
    });
  }

  /** Forma convexa a partir de puntos (rampas en cuña, lomas). */
  convex({ points, material, surface }) {
    const vecs = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const geo = new ConvexGeometry(vecs);
    this._mesh(geo, material, { x: 0, y: 0, z: 0 }, null);
    const flat = new Float32Array(points.flat());
    const desc = this.R.ColliderDesc.convexHull(flat);
    this._collider(desc, { x: 0, y: 0, z: 0 }, null, { surface });
  }

  /** Rampa en cuña que sube en la dirección `yaw` (0 = hacia +X). */
  wedge({ x, z, length, width, height, yaw = 0, material, surface = 'asfalto' }) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
    const L = length / 2, W = width / 2;
    this.convex({
      points: [
        P(-L, 0, -W), P(-L, 0, W), P(L, 0, -W), P(L, 0, W),
        P(L, height, -W), P(L, height, W),
      ],
      material,
      surface,
    });
  }

  cylinder({ radius, height, pos, material, dynamic, mass, geo }) {
    const mesh = this._mesh(geo ?? new THREE.CylinderGeometry(radius, radius, height, 12), material, pos, null);
    const desc = this.R.ColliderDesc.cylinder(height / 2, radius).setFriction(0.6);
    const { body } = this._collider(desc, pos, null, { dynamic, mass });
    if (body) this.dynamic.push({ body, mesh });
    return mesh;
  }

  capsule({ radius, length, pos, rot, material }) {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0));
    this._mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), material, pos, quat);
    this._collider(this.R.ColliderDesc.capsule(length / 2, radius), pos, quat, {});
  }

  /** Sincroniza los objetos que se mueven (conos, cajas) con la física. */
  sync() {
    for (const { body, mesh } of this.dynamic) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
