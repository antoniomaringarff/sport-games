// ============================================================
//  PERILLAS DEL JUEGO
//  Todo lo que cambia cómo se siente el juego está acá.
//  Cambiá un número, guardá, y el navegador se recarga solo.
// ============================================================

// ---------- Física general ----------
export const PHYSICS = {
  GRAVITY: 9.81,      // gravedad (m/s²). Más alto = el auto "pesa" más y salta menos
  STEP_HZ: 60,        // cuántas veces por segundo se calcula la física
};

// ---------- Superficies ----------
// GRIP: multiplica el agarre de las ruedas. 1 = asfalto normal.
// Cada auto además tiene su propia tabla OFFROAD (ver abajo).
export const SURFACES = {
  asfalto:  { label: 'Asfalto',  grip: 1.0,  drag: 0.0 },
  adoquin:  { label: 'Adoquín',  grip: 0.82, drag: 0.0, bumpy: 0.6 },
  tierra:   { label: 'Tierra',   grip: 0.62, drag: 0.6 },
  arena:    { label: 'Arena',    grip: 0.5,  drag: 2.2 },
  nieve:    { label: 'Nieve',    grip: 0.35, drag: 0.8 },
  pasto:    { label: 'Pasto',    grip: 0.6,  drag: 0.9 },
};

// ---------- Los autos ----------
// Unidades: masa en kg, fuerzas en Newtons, distancias en metros, velocidad en km/h.
export const CARS = {
  f1: {
    name: 'Fórmula 1',
    color: 0xd7262e,
    MASS: 750,                 // liviano = acelera y frena muy rápido
    LENGTH: 5.0, WIDTH: 1.9, HEIGHT: 0.55,
    WHEEL_RADIUS: 0.36,
    WHEELBASE: 3.4,            // distancia entre eje delantero y trasero
    TRACK: 1.6,                // distancia entre rueda izquierda y derecha
    RIDE_HEIGHT: 0.05,         // altura del piso del auto (muy bajo = raspa)
    CENTER_OF_MASS_Y: -0.25,   // más negativo = centro de masa más bajo = vuelca menos
    DRIVE: 'rear',             // 'rear' (trasera), 'front' (delantera) o 'all' (4x4)
    ENGINE_FORCE: 9000,        // más alto = acelera más fuerte
    TOP_SPEED: 320,            // velocidad máxima (km/h)
    REVERSE_SPEED: 30,
    BRAKE: 16,                 // poder de frenado (m/s²). Más alto = frena más seco
    HANDBRAKE: 9,              // poder del freno de mano (m/s²)
    MAX_STEER: 0.42,           // cuánto doblan las ruedas (radianes) a baja velocidad
    STEER_AT_SPEED: 0.07,      // cuánto doblan a velocidad máxima (más chico = más estable)
    STEER_SPEED: 4.0,          // qué tan rápido gira el volante
    GRIP: 1.6,                 // agarre de las ruedas: bajo = derrapa más
    SIDE_GRIP: 1.2,            // agarre lateral (para curvas)
    REAR_GRIP_HANDBRAKE: 0.35, // agarre trasero con freno de mano (bajo = derrapa más)
    DOWNFORCE: 0.002,          // aerodinámica: aprieta el auto contra el piso a alta velocidad
    SUSPENSION_STIFFNESS: 70,  // más alto = suspensión más dura
    SUSPENSION_DAMPING: 6,     // más alto = rebota menos
    SUSPENSION_TRAVEL: 0.08,   // recorrido de la suspensión
    ANTI_ROLL: 0.6,            // resistencia a inclinarse en curvas (0 a 1)
    // Agarre extra (o menos) según superficie. 1 = como dice SURFACES.
    OFFROAD: { asfalto: 1, adoquin: 0.95, tierra: 0.6, arena: 0.5, nieve: 0.55, pasto: 0.6 },
    stats: { velocidad: 5, agarre: 5, todoterreno: 1 },
  },

  pickup: {
    name: 'Camioneta',
    color: 0x2f6fb0,
    MASS: 2200,
    LENGTH: 5.3, WIDTH: 2.0, HEIGHT: 1.1,
    WHEEL_RADIUS: 0.45,
    WHEELBASE: 3.2,
    TRACK: 1.75,
    RIDE_HEIGHT: 0.35,
    CENTER_OF_MASS_Y: -0.45,
    DRIVE: 'all',
    ENGINE_FORCE: 11000,
    TOP_SPEED: 170,
    REVERSE_SPEED: 35,
    BRAKE: 11,
    HANDBRAKE: 7,
    MAX_STEER: 0.55,
    STEER_AT_SPEED: 0.16,
    STEER_SPEED: 2.6,
    GRIP: 0.95,
    SIDE_GRIP: 0.9,
    REAR_GRIP_HANDBRAKE: 0.3,
    DOWNFORCE: 0,
    SUSPENSION_STIFFNESS: 24,
    SUSPENSION_DAMPING: 3,
    SUSPENSION_TRAVEL: 0.28,
    ANTI_ROLL: 0.35,
    OFFROAD: { asfalto: 1, adoquin: 1.1, tierra: 1.45, arena: 1.6, nieve: 1.9, pasto: 1.4 },
    stats: { velocidad: 2, agarre: 3, todoterreno: 5 },
  },

  luxury: {
    name: 'Auto de lujo',
    color: 0x1b1b22,
    MASS: 1800,
    LENGTH: 5.0, WIDTH: 1.95, HEIGHT: 0.75,
    WHEEL_RADIUS: 0.38,
    WHEELBASE: 3.0,
    TRACK: 1.65,
    RIDE_HEIGHT: 0.14,
    CENTER_OF_MASS_Y: -0.35,
    DRIVE: 'rear',
    ENGINE_FORCE: 11500,
    TOP_SPEED: 250,
    REVERSE_SPEED: 30,
    BRAKE: 12,
    HANDBRAKE: 8,
    MAX_STEER: 0.5,
    STEER_AT_SPEED: 0.1,
    STEER_SPEED: 3.2,
    GRIP: 1.15,
    SIDE_GRIP: 1.05,
    REAR_GRIP_HANDBRAKE: 0.4,
    DOWNFORCE: 0.0008,
    SUSPENSION_STIFFNESS: 38,
    SUSPENSION_DAMPING: 4,
    SUSPENSION_TRAVEL: 0.16,
    ANTI_ROLL: 0.5,
    OFFROAD: { asfalto: 1, adoquin: 1, tierra: 0.85, arena: 0.7, nieve: 0.75, pasto: 0.85 },
    stats: { velocidad: 4, agarre: 4, todoterreno: 2 },
  },
};

// ---------- Ayudas de manejo ----------
export const ASSISTS = {
  ANTI_FLIP: true,        // ayuda a que el auto no vuelque
  AIR_CONTROL: 0.6,       // cuánto se endereza solo en el aire (0 = nada)
  AUTO_RESET_SECONDS: 3,  // si está dado vuelta tanto tiempo, se reubica solo
};

// ---------- Cámara ----------
// Tecla C cambia entre estas vistas, en este orden.
export const CAMERA = {
  VIEWS: {
    lejos:     { label: 'Afuera lejos',  DISTANCE: 11,  HEIGHT: 3.6, LOOK_AHEAD: 6 },
    cerca:     { label: 'Afuera cerca',  DISTANCE: 6.8, HEIGHT: 2.3, LOOK_AHEAD: 5 },
    conductor: { label: 'Conductor' },   // adentro del auto (posición de los ojos: DRIVER_EYE de cada auto)
    frente:    { label: 'Frente' },      // en la trompa: solo se ve el camino
  },
  ORDER: ['cerca', 'lejos', 'conductor', 'frente'],
  DISTANCE_AT_SPEED: 2.5, // cuánto se aleja extra a toda velocidad
  FOV: 62,                // ángulo de visión normal
  FOV_AT_SPEED: 16,       // cuánto se abre a toda velocidad (sensación de velocidad)
  SMOOTHING: 6,           // más alto = la cámara sigue más pegada al auto
  SWING: 0.2,             // cuánto se corre al costado al doblar (radianes). 0 = nada
  SWING_SMOOTHING: 2.5,   // qué tan suave entra y sale ese giro
};

// Dónde van los ojos del conductor en cada auto (metros desde el centro: x adelante, y arriba, z derecha)
export const DRIVER_EYE = {
  f1:     { x: 0.05,  y: 0.52, z: 0 },
  pickup: { x: 0.25,  y: 0.45, z: -0.4 },
  luxury: { x: -0.2,  y: 0.62, z: -0.38 },
};
