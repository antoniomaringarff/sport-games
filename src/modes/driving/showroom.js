// Showroom: una escena aparte con una plataforma giratoria para elegir el auto.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCarModel } from './carModel.js';
import { carAsset, physicsProfile } from './carAssets.js';

const TOP = 0.25; // altura de la plataforma

export function createShowroom(renderer) {
  const scene = new THREE.Scene();
  // reflejos de estudio en la pintura y los vidrios
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }
  scene.background = new THREE.Color(0x0e1622);
  scene.fog = new THREE.Fog(0x0e1622, 14, 40);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  // Luces de estudio
  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1410, 0.9));
  const key = new THREE.SpotLight(0xfff2e0, 150, 30, 0.55, 0.6, 1.6);
  key.position.set(5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7fb4ff, 0.9);
  rim.position.set(-6, 4, -7);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffc27a, 20, 20);
  fill.position.set(-4, 1.5, 5);
  scene.add(fill);

  // Piso y plataforma
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a222e, roughness: 0.35, metalness: 0.3 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const turntable = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.75, TOP, 64),
    new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.3, metalness: 0.6 }),
  );
  disc.position.y = TOP / 2;
  disc.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.68, 0.035, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = TOP;
  turntable.add(disc, ring);
  scene.add(turntable);

  let current = null; // { id, model }
  let pop = 1;

  function show(id) {
    if (current?.id === id) return;
    if (current) {
      turntable.remove(current.model.group);
      current.model.dispose();
    }
    const profile = physicsProfile(id);
    const asset = carAsset(id);
    const model = createCarModel(id, profile, null, asset);
    // apoyar las ruedas sobre la plataforma
    const y = profile.MODEL_OFFSET ? TOP - profile.MODEL_OFFSET.y : TOP + profile.HEIGHT / 2 + profile.RIDE_HEIGHT + 0.05;
    model.group.position.set(0, y, 0);
    turntable.add(model.group);
    current = { id, model };
    pop = 0;
  }

  return {
    scene,
    camera,
    show,
    update(dt, renderer) {
      turntable.rotation.y += dt * 0.45;
      if (current) {
        pop = Math.min(1, pop + dt * 3.5);
        const s = 0.85 + 0.15 * easeOutBack(pop);
        current.model.group.scale.setScalar(s);
      }
      const { width, height } = renderer.domElement;
      camera.aspect = width / height;
      // en pantallas angostas, alejarse para que entre el auto
      const dist = camera.aspect < 1 ? 15 : 10.5;
      camera.position.set(dist * 0.72, 3.0, dist * 0.7);
      camera.lookAt(0, 0.2, 0);
      camera.updateProjectionMatrix();
    },
  };
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
