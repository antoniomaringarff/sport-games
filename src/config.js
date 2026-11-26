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
  ripio:    { label: 'Ripio',    grip: 0.55, drag: 0.45, bumpy: 0.5 }, // piedras sueltas: patina más
  arena:    { label: 'Arena',    grip: 0.5,  drag: 2.2 },
  nieve:    { label: 'Nieve',    grip: 0.35, drag: 0.8 },
  pasto:    { label: 'Pasto',    grip: 0.6,  drag: 0.9 },
};

// ---------- Secciones del menú de autos ----------
export const SECTIONS = {
  carreras:    'Carreras',
  rally:       'Rally',
  todoterreno: 'Todo terreno',
  altagama:    'Alta gama',
  tienda:      'De la tienda',
};

// ---------- Los autos ----------
// Unidades: masa en kg, fuerzas en Newtons, distancias en metros, velocidad en km/h.
// section: en qué sección del menú aparece (ver SECTIONS).
export const CARS = {
  f1: {
    name: 'Fórmula 1',
    section: 'carreras',
    color: 0x2a2f3d,
    paint: { material: 'sauber_paint', keepTexture: false }, // material del modelo que se pinta
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
    BRAKE: 48,                 // poder de frenado (m/s²). Más alto = frena más seco (el ABS lo limita al agarre)
    HANDBRAKE: 9,              // poder del freno de mano (m/s²)
    MAX_STEER: 0.42,           // cuánto doblan las ruedas (radianes) a baja velocidad
    STEER_AT_SPEED: 0.07,      // cuánto doblan a velocidad máxima (más chico = más estable)
    STEER_SPEED: 4.0,          // qué tan rápido gira el volante
    GRIP: 1.6,                 // agarre de las ruedas: bajo = derrapa más
    SIDE_GRIP: 1.2,            // agarre lateral (para curvas)
    REAR_GRIP_HANDBRAKE: 0.35, // agarre trasero con freno de mano (bajo = derrapa más)
    DOWNFORCE: 0.0045,         // aerodinámica: aprieta el auto contra el piso a alta velocidad
    AERO_DRAG: 0.0006,         // resistencia del aire: frena al soltar el acelerador (más a más velocidad)
    SUSPENSION_STIFFNESS: 70,  // más alto = suspensión más dura
    SUSPENSION_DAMPING: 6,     // más alto = rebota menos
    SUSPENSION_TRAVEL: 0.08,   // recorrido de la suspensión
    ANTI_ROLL: 0.6,            // resistencia a inclinarse en curvas (0 a 1)
    // Agarre extra (o menos) según superficie. 1 = como dice SURFACES.
    OFFROAD: { asfalto: 1, adoquin: 0.95, tierra: 0.6, ripio: 0.57, arena: 0.5, nieve: 0.55, pasto: 0.6 },
    // Sonido del motor
    SOUND: { IDLE_RPM: 4500, MAX_RPM: 15000, GEARS: 8, PULSES: 3, GRIT: 0.35, BRIGHT: 1.0, VOLUME: 0.9 },
    stats: { velocidad: 5, agarre: 5, todoterreno: 1 },
  },

  pickup: {
    name: 'Camioneta',
    section: 'todoterreno',
    color: 0x1d1f24,
    paint: { material: 'krmlgtbdy85_Bodymat', keepTexture: false },
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
    BRAKE: 12,
    HANDBRAKE: 7,
    MAX_STEER: 0.55,
    STEER_AT_SPEED: 0.16,
    STEER_SPEED: 2.6,
    GRIP: 0.95,
    SIDE_GRIP: 0.9,
    REAR_GRIP_HANDBRAKE: 0.3,
    DOWNFORCE: 0,
    AERO_DRAG: 0.00045,
    SUSPENSION_STIFFNESS: 24,
    SUSPENSION_DAMPING: 3,
    SUSPENSION_TRAVEL: 0.28,
    ANTI_ROLL: 0.35,
    OFFROAD: { asfalto: 1, adoquin: 1.1, tierra: 1.45, ripio: 1.38, arena: 1.6, nieve: 1.9, pasto: 1.4 },
    SOUND: { IDLE_RPM: 750, MAX_RPM: 5200, GEARS: 6, PULSES: 4, GRIT: 0.8, BRIGHT: 0.35, VOLUME: 1.0 },
    stats: { velocidad: 2, agarre: 3, todoterreno: 5 },
  },

  luxury: {
    name: 'Auto de lujo',
    section: 'altagama',
    color: 0xcfd2d6,
    paint: { material: 'Paint', keepTexture: true },
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
    BRAKE: 15,
    HANDBRAKE: 8,
    MAX_STEER: 0.5,
    STEER_AT_SPEED: 0.1,
    STEER_SPEED: 3.2,
    GRIP: 1.15,
    SIDE_GRIP: 1.05,
    REAR_GRIP_HANDBRAKE: 0.4,
    DOWNFORCE: 0.0008,
    AERO_DRAG: 0.0003,
    SUSPENSION_STIFFNESS: 38,
    SUSPENSION_DAMPING: 4,
    SUSPENSION_TRAVEL: 0.16,
    ANTI_ROLL: 0.5,
    OFFROAD: { asfalto: 1, adoquin: 1, tierra: 0.85, ripio: 0.81, arena: 0.7, nieve: 0.75, pasto: 0.85 },
    SOUND: { IDLE_RPM: 850, MAX_RPM: 7200, GEARS: 7, PULSES: 6, GRIT: 0.25, BRIGHT: 0.6, VOLUME: 0.85 },
    stats: { velocidad: 4, agarre: 4, todoterreno: 2 },
  },
  rally: {
    name: 'Rally clásico',
    section: 'rally',
    color: 0x22355e,
    paint: { material: 'CarPaint', keepTexture: false },
    MASS: 1250,                // liviano y ágil
    LENGTH: 4.1, WIDTH: 1.85, HEIGHT: 1.3,
    WHEEL_RADIUS: 0.42,
    WHEELBASE: 2.55,
    TRACK: 1.6,
    RIDE_HEIGHT: 0.22,         // alto para el ripio y los saltos
    CENTER_OF_MASS_Y: -0.4,
    DRIVE: 'all',              // 4x4
    ENGINE_FORCE: 10500,
    TOP_SPEED: 205,
    REVERSE_SPEED: 35,
    BRAKE: 14,
    HANDBRAKE: 11,             // freno de mano fuerte: para cruzarlo en las horquillas
    MAX_STEER: 0.6,
    STEER_AT_SPEED: 0.15,
    STEER_SPEED: 4.4,          // volante rápido
    GRIP: 1.1,
    SIDE_GRIP: 1.0,
    REAR_GRIP_HANDBRAKE: 0.28,
    DOWNFORCE: 0.0004,
    AERO_DRAG: 0.00035,
    SUSPENSION_STIFFNESS: 30,
    SUSPENSION_DAMPING: 3.4,
    SUSPENSION_TRAVEL: 0.24,   // mucho recorrido: absorbe pozos y saltos
    ANTI_ROLL: 0.45,
    // En tierra y ripio agarra mucho más que los otros
    OFFROAD: { asfalto: 1, adoquin: 1.05, tierra: 1.65, ripio: 1.57, arena: 1.35, nieve: 1.6, pasto: 1.35 },
    SOUND: { IDLE_RPM: 950, MAX_RPM: 7800, GEARS: 6, PULSES: 2, GRIT: 0.65, BRIGHT: 0.75, VOLUME: 0.95 },
    stats: { velocidad: 3, agarre: 4, todoterreno: 4 },
  },
  wrc: {
    name: 'Rally WRC',
    section: 'rally',
    color: 0x1d3fbf,
    paint: { material: 'carpaint', keepTexture: true }, // tiñe el ploteo de rally
    MASS: 1200,                // auto de rally de verdad: liviano, turbo y 4x4
    LENGTH: 4.0, WIDTH: 1.9, HEIGHT: 1.4,
    WHEEL_RADIUS: 0.33,
    WHEELBASE: 2.5,
    TRACK: 1.56,
    RIDE_HEIGHT: 0.2,
    CENTER_OF_MASS_Y: -0.42,
    DRIVE: 'all',
    ENGINE_FORCE: 11000,
    TOP_SPEED: 210,
    REVERSE_SPEED: 35,
    BRAKE: 15,
    HANDBRAKE: 12,             // el que mejor cruza en las horquillas
    MAX_STEER: 0.62,
    STEER_AT_SPEED: 0.15,
    STEER_SPEED: 4.8,
    GRIP: 1.12,
    SIDE_GRIP: 1.02,
    REAR_GRIP_HANDBRAKE: 0.26,
    DOWNFORCE: 0.0006,         // alerón grande
    AERO_DRAG: 0.00038,
    SUSPENSION_STIFFNESS: 28,
    SUSPENSION_DAMPING: 3.4,
    SUSPENSION_TRAVEL: 0.26,
    ANTI_ROLL: 0.45,
    OFFROAD: { asfalto: 1, adoquin: 1.08, tierra: 1.75, ripio: 1.68, arena: 1.4, nieve: 1.7, pasto: 1.4 },
    SOUND: { IDLE_RPM: 1100, MAX_RPM: 8500, GEARS: 6, PULSES: 2, GRIT: 0.75, BRIGHT: 0.85, VOLUME: 1.0 },
    stats: { velocidad: 3, agarre: 4, todoterreno: 5 },
  },
  suv: {
    name: 'SUV 4x4',
    section: 'todoterreno',
    color: 0x4a9fd8,
    paint: { material: 'CarPaint', keepTexture: false }, // también pinta CarPaint_N2
    MASS: 2300,                // pesada pero cómoda: va lejos por cualquier camino
    LENGTH: 4.93, WIDTH: 1.98, HEIGHT: 1.6,
    WHEEL_RADIUS: 0.41,
    WHEELBASE: 2.85,
    TRACK: 1.67,
    RIDE_HEIGHT: 0.3,
    CENTER_OF_MASS_Y: -0.45,
    DRIVE: 'all',
    ENGINE_FORCE: 10500,
    TOP_SPEED: 175,
    REVERSE_SPEED: 35,
    BRAKE: 12,
    HANDBRAKE: 7,
    MAX_STEER: 0.52,
    STEER_AT_SPEED: 0.15,
    STEER_SPEED: 2.6,
    GRIP: 1.0,
    SIDE_GRIP: 0.92,
    REAR_GRIP_HANDBRAKE: 0.32,
    DOWNFORCE: 0,
    AERO_DRAG: 0.0005,
    SUSPENSION_STIFFNESS: 26,
    SUSPENSION_DAMPING: 3.2,
    SUSPENSION_TRAVEL: 0.26,
    ANTI_ROLL: 0.4,
    OFFROAD: { asfalto: 1, adoquin: 1.1, tierra: 1.5, ripio: 1.45, arena: 1.7, nieve: 1.8, pasto: 1.45 },
    SOUND: { IDLE_RPM: 700, MAX_RPM: 4800, GEARS: 8, PULSES: 2, GRIT: 0.7, BRIGHT: 0.4, VOLUME: 0.95 },
    stats: { velocidad: 2, agarre: 4, todoterreno: 4 },
  },
  hyper: {
    name: 'Hiperdeportivo',
    section: 'altagama',
    color: 0xc8102e,
    paint: { material: 'Paint_Material', keepTexture: false }, // la textura es roja: teñida queda oscura
    MASS: 1250,                // V12 híbrido de pista: el más rápido después del F1
    LENGTH: 4.9, WIDTH: 2.05, HEIGHT: 1.1,
    WHEEL_RADIUS: 0.35,
    WHEELBASE: 2.67,
    TRACK: 1.7,
    RIDE_HEIGHT: 0.1,
    CENTER_OF_MASS_Y: -0.32,
    DRIVE: 'rear',
    ENGINE_FORCE: 14000,
    TOP_SPEED: 330,
    REVERSE_SPEED: 30,
    BRAKE: 30,                 // frenos carbono-cerámicos
    HANDBRAKE: 8,
    MAX_STEER: 0.46,
    STEER_AT_SPEED: 0.08,
    STEER_SPEED: 3.6,
    GRIP: 1.35,
    SIDE_GRIP: 1.15,
    REAR_GRIP_HANDBRAKE: 0.38,
    DOWNFORCE: 0.0025,         // alerón y difusor de pista
    AERO_DRAG: 0.0004,
    SUSPENSION_STIFFNESS: 55,
    SUSPENSION_DAMPING: 5.5,
    SUSPENSION_TRAVEL: 0.1,
    ANTI_ROLL: 0.55,
    OFFROAD: { asfalto: 1, adoquin: 0.95, tierra: 0.7, ripio: 0.66, arena: 0.55, nieve: 0.6, pasto: 0.7 },
    SOUND: { IDLE_RPM: 1000, MAX_RPM: 9200, GEARS: 7, PULSES: 6, GRIT: 0.3, BRIGHT: 0.95, VOLUME: 0.95 },
    stats: { velocidad: 5, agarre: 4, todoterreno: 1 },
  },

  // ---------- Autos de la tienda del mapa (inventados) ----------
  // price: cuántas monedas cuesta. shape: qué forma de cajitas tiene (carModel.js).
  // Sin price = viene de regalo.
  furgo: {
    name: 'Furgo Reparto',
    section: 'tienda', shape: 'van', price: 150,
    color: 0xf2f2f2,
    MASS: 2000,                // alta y pesada: cuidado en las curvas que vuelca
    LENGTH: 5.0, WIDTH: 2.0, HEIGHT: 2.2,
    WHEEL_RADIUS: 0.38, WHEELBASE: 3.1, TRACK: 1.72,
    RIDE_HEIGHT: 0.22, CENTER_OF_MASS_Y: -0.55,
    DRIVE: 'front',
    ENGINE_FORCE: 7500, TOP_SPEED: 145, REVERSE_SPEED: 30,
    BRAKE: 11, HANDBRAKE: 7,
    MAX_STEER: 0.55, STEER_AT_SPEED: 0.16, STEER_SPEED: 2.6,
    GRIP: 0.95, SIDE_GRIP: 0.9, REAR_GRIP_HANDBRAKE: 0.35,
    DOWNFORCE: 0, AERO_DRAG: 0.0007,
    SUSPENSION_STIFFNESS: 26, SUSPENSION_DAMPING: 3.2, SUSPENSION_TRAVEL: 0.2, ANTI_ROLL: 0.45,
    OFFROAD: { asfalto: 1, adoquin: 1, tierra: 0.9, ripio: 0.85, arena: 0.7, nieve: 0.8, pasto: 0.9 },
    SOUND: { IDLE_RPM: 800, MAX_RPM: 5000, GEARS: 5, PULSES: 4, GRIT: 0.6, BRIGHT: 0.4, VOLUME: 0.85 },
    stats: { velocidad: 1, agarre: 2, todoterreno: 2 },
  },
  kart: {
    name: 'Kart Pulga',
    section: 'tienda', shape: 'kart', price: 300,
    color: 0x1f9e4a,
    MASS: 420,                 // chiquito: dobla en cualquier lado
    LENGTH: 2.4, WIDTH: 1.5, HEIGHT: 0.5,
    WHEEL_RADIUS: 0.25, WHEELBASE: 1.6, TRACK: 1.3,
    RIDE_HEIGHT: 0.05, CENTER_OF_MASS_Y: -0.2,
    DRIVE: 'rear',
    ENGINE_FORCE: 3600, TOP_SPEED: 125, REVERSE_SPEED: 20,
    BRAKE: 16, HANDBRAKE: 8,
    MAX_STEER: 0.5, STEER_AT_SPEED: 0.14, STEER_SPEED: 5.0,
    GRIP: 1.3, SIDE_GRIP: 1.15, REAR_GRIP_HANDBRAKE: 0.35,
    DOWNFORCE: 0, AERO_DRAG: 0.0003,
    SUSPENSION_STIFFNESS: 60, SUSPENSION_DAMPING: 5, SUSPENSION_TRAVEL: 0.05, ANTI_ROLL: 0.6,
    OFFROAD: { asfalto: 1, adoquin: 0.9, tierra: 0.7, ripio: 0.65, arena: 0.5, nieve: 0.6, pasto: 0.7 },
    SOUND: { IDLE_RPM: 1800, MAX_RPM: 11000, GEARS: 1, PULSES: 1, GRIT: 0.5, BRIGHT: 1.0, VOLUME: 0.8 },
    stats: { velocidad: 2, agarre: 4, todoterreno: 1 },
  },
  buggy: {
    name: 'Buggy Médano',
    section: 'tienda', shape: 'buggy', price: 900,
    color: 0xff6a13,
    MASS: 900,                 // el rey de la playa
    LENGTH: 3.6, WIDTH: 1.9, HEIGHT: 1.4,
    WHEEL_RADIUS: 0.44, WHEELBASE: 2.4, TRACK: 1.65,
    RIDE_HEIGHT: 0.3, CENTER_OF_MASS_Y: -0.45,
    DRIVE: 'all',
    ENGINE_FORCE: 8200, TOP_SPEED: 165, REVERSE_SPEED: 35,
    BRAKE: 13, HANDBRAKE: 11,
    MAX_STEER: 0.6, STEER_AT_SPEED: 0.16, STEER_SPEED: 4.4,
    GRIP: 1.05, SIDE_GRIP: 0.95, REAR_GRIP_HANDBRAKE: 0.28,
    DOWNFORCE: 0, AERO_DRAG: 0.0004,
    SUSPENSION_STIFFNESS: 22, SUSPENSION_DAMPING: 2.8, SUSPENSION_TRAVEL: 0.32, ANTI_ROLL: 0.4,
    OFFROAD: { asfalto: 1, adoquin: 1.05, tierra: 1.6, ripio: 1.55, arena: 2.0, nieve: 1.5, pasto: 1.4 },
    SOUND: { IDLE_RPM: 1000, MAX_RPM: 7000, GEARS: 5, PULSES: 2, GRIT: 0.85, BRIGHT: 0.6, VOLUME: 0.95 },
    stats: { velocidad: 3, agarre: 3, todoterreno: 5 },
  },
  muscle: {
    name: 'Trueno V8',
    section: 'tienda', shape: 'muscle', price: 1500,
    color: 0xffc72c,
    MASS: 1600,                // mucho motor, poco agarre atrás: para derrapar
    LENGTH: 4.8, WIDTH: 1.9, HEIGHT: 1.25,
    WHEEL_RADIUS: 0.37, WHEELBASE: 2.8, TRACK: 1.6,
    RIDE_HEIGHT: 0.12, CENTER_OF_MASS_Y: -0.35,
    DRIVE: 'rear',
    ENGINE_FORCE: 12500, TOP_SPEED: 265, REVERSE_SPEED: 30,
    BRAKE: 14, HANDBRAKE: 9,
    MAX_STEER: 0.5, STEER_AT_SPEED: 0.1, STEER_SPEED: 3.4,
    GRIP: 1.0, SIDE_GRIP: 0.92, REAR_GRIP_HANDBRAKE: 0.3,
    DOWNFORCE: 0.0004, AERO_DRAG: 0.00035,
    SUSPENSION_STIFFNESS: 34, SUSPENSION_DAMPING: 3.8, SUSPENSION_TRAVEL: 0.15, ANTI_ROLL: 0.5,
    OFFROAD: { asfalto: 1, adoquin: 0.95, tierra: 0.8, ripio: 0.75, arena: 0.65, nieve: 0.7, pasto: 0.8 },
    SOUND: { IDLE_RPM: 750, MAX_RPM: 6500, GEARS: 5, PULSES: 4, GRIT: 0.9, BRIGHT: 0.45, VOLUME: 1.0 },
    stats: { velocidad: 4, agarre: 2, todoterreno: 2 },
  },
  monster: {
    name: 'Monstruo Bravo',
    section: 'tienda', shape: 'monster', price: 2500,
    color: 0x6b2fbf,
    MASS: 2800,                // ruedas gigantes: pasa por arriba de todo
    LENGTH: 4.6, WIDTH: 2.6, HEIGHT: 1.5,
    WHEEL_RADIUS: 0.8, WHEELBASE: 3.0, TRACK: 2.4,
    RIDE_HEIGHT: 0.55, CENTER_OF_MASS_Y: -0.7,
    DRIVE: 'all',
    ENGINE_FORCE: 17000, TOP_SPEED: 140, REVERSE_SPEED: 35,
    BRAKE: 10, HANDBRAKE: 7,
    MAX_STEER: 0.55, STEER_AT_SPEED: 0.18, STEER_SPEED: 2.6,
    GRIP: 1.0, SIDE_GRIP: 0.9, REAR_GRIP_HANDBRAKE: 0.35,
    DOWNFORCE: 0, AERO_DRAG: 0.0006,
    SUSPENSION_STIFFNESS: 16, SUSPENSION_DAMPING: 2.4, SUSPENSION_TRAVEL: 0.5, ANTI_ROLL: 0.55,
    OFFROAD: { asfalto: 1, adoquin: 1.1, tierra: 1.5, ripio: 1.5, arena: 1.7, nieve: 1.7, pasto: 1.5 },
    SOUND: { IDLE_RPM: 650, MAX_RPM: 5000, GEARS: 4, PULSES: 4, GRIT: 1.0, BRIGHT: 0.3, VOLUME: 1.0 },
    stats: { velocidad: 2, agarre: 3, todoterreno: 5 },
  },
  cohete: {
    name: 'Cohete X',
    section: 'tienda', shape: 'rocket', price: 6000,
    color: 0x4fb3e8,
    MASS: 1100,                // el más rápido del juego
    LENGTH: 4.6, WIDTH: 2.0, HEIGHT: 0.9,
    WHEEL_RADIUS: 0.34, WHEELBASE: 2.8, TRACK: 1.7,
    RIDE_HEIGHT: 0.08, CENTER_OF_MASS_Y: -0.3,
    DRIVE: 'all',
    ENGINE_FORCE: 17000, TOP_SPEED: 380, REVERSE_SPEED: 30,
    BRAKE: 32, HANDBRAKE: 8,
    MAX_STEER: 0.45, STEER_AT_SPEED: 0.07, STEER_SPEED: 3.8,
    GRIP: 1.5, SIDE_GRIP: 1.2, REAR_GRIP_HANDBRAKE: 0.38,
    DOWNFORCE: 0.003, AERO_DRAG: 0.0003,
    SUSPENSION_STIFFNESS: 60, SUSPENSION_DAMPING: 5.5, SUSPENSION_TRAVEL: 0.08, ANTI_ROLL: 0.6,
    OFFROAD: { asfalto: 1, adoquin: 0.95, tierra: 0.65, ripio: 0.6, arena: 0.5, nieve: 0.55, pasto: 0.65 },
    SOUND: { IDLE_RPM: 1500, MAX_RPM: 12000, GEARS: 7, PULSES: 3, GRIT: 0.3, BRIGHT: 1.0, VOLUME: 0.9 },
    stats: { velocidad: 5, agarre: 5, todoterreno: 1 },
  },
};

/** Autos en el orden del menú: sección por sección. */
export const CAR_IDS = Object.keys(SECTIONS).flatMap((s) => Object.keys(CARS).filter((id) => CARS[id].section === s));

// ---------- Colores de pintura ----------
// Si no elegís uno, cada auto sale de un color al azar (así en el multijugador se distinguen).
// 'original' deja la pintura que trae el modelo.
export const COLORS = {
  original: { name: 'Original', hex: null },
  rojo:     { name: 'Rojo',     hex: 0xc8102e },
  naranja:  { name: 'Naranja',  hex: 0xff6a13 },
  amarillo: { name: 'Amarillo', hex: 0xffc72c },
  verde:    { name: 'Verde',    hex: 0x1f9e4a },
  celeste:  { name: 'Celeste',  hex: 0x4fb3e8 },
  azul:     { name: 'Azul',     hex: 0x1d3fbf },
  violeta:  { name: 'Violeta',  hex: 0x6b2fbf },
  rosa:     { name: 'Rosa',     hex: 0xff4f9a },
  blanco:   { name: 'Blanco',   hex: 0xf2f2f2 },
  negro:    { name: 'Negro',    hex: 0x141414 },
  plata:    { name: 'Plata',    hex: 0x9aa3ad },
};
/** Colores que pueden salir al azar (todos menos el original). */
export const RANDOM_COLORS = Object.keys(COLORS).filter((c) => c !== 'original');

// ---------- Luz de cada lugar ----------
// ELEVATION: altura del sol en grados (5 = atardecer, 60 = mediodía)
// AZIMUTH: de dónde viene el sol (180 = sur/mar, 270 = oeste)
// EXPOSURE: brillo general de la imagen · SKY_LIGHT: luz del cielo que rellena las sombras
export const LIGHT = {
  monaco: {
    ELEVATION: 38, AZIMUTH: 228, SUN_COLOR: 0xffeed6, SUN: 3.6,
    SKY_LIGHT: 1.5, EXPOSURE: 0.68, FOG: [0xa9bfd6, 1400, 13000],
  },
  rally: {
    ELEVATION: 34, AZIMUTH: 215, SUN_COLOR: 0xffeed6, SUN: 3.6,
    SKY_LIGHT: 1.5, EXPOSURE: 0.68, FOG: [0xa9bfd6, 1600, 15000],
  },
  condor: {
    // mediodía en las Altas Cumbres: aire limpio, sol fuerte, se ve lejísimos
    ELEVATION: 48, AZIMUTH: 20, SUN_COLOR: 0xfff2e2, SUN: 3.8,
    SKY_LIGHT: 1.6, EXPOSURE: 0.66, FOG: [0xb5c8dc, 2500, 26000],
  },
  mapa: {
    ELEVATION: 46, AZIMUTH: 205, SUN_COLOR: 0xffeed6, SUN: 3.5,
    SKY_LIGHT: 1.45, EXPOSURE: 0.66, FOG: [0xaecbe3, 900, 7000],
  },
  pista: {
    ELEVATION: 40, AZIMUTH: 210, SUN_COLOR: 0xffeed6, SUN: 3.3,
    SKY_LIGHT: 1.3, EXPOSURE: 0.64, FOG: [0xbfd4e6, 180, 900],
  },
};

// ---------- Minimapa ----------
export const MINIMAP = {
  SIZE: 190,            // tamaño en pantalla (px)
  LOOK_AHEAD: 260,      // cuántos metros de pista que viene se pintan de color
  WARN_DISTANCE: 220,   // a cuántos metros aparece el cartel de la próxima curva
  WARN_CLOSE: 70,       // a cuántos metros el cartel empieza a titilar
};

// ---------- Gráficos ----------
// Tecla Q en el menú: cambia la calidad (alta → media → baja) y recarga.
export const GRAPHICS = {
  QUALITY: 'alta',      // 'alta', 'media' o 'baja' (si el juego va lento, bajala)
  VIGNETTE: 0.55,       // bordes un poco más oscuros (0 = nada, 1 = mucho)
  ENV_LIGHT: 0.32,     // cuánto ilumina y se refleja el cielo (más alto = todo brilla más)
  CLOUDS: 0.7,          // cantidad de nubes (0 = cielo limpio)
  DYNAMIC_RESOLUTION: true, // si va lento, baja un poco la resolución sola para mantener 60 fps
  TOUCH_QUALITY: 'media', // calidad de arranque en celulares y tablets (si no se eligió otra)
};

// ---------- Controles táctiles (celular y tablet) ----------
// Como F1 Mobile Racing y Real Racing 3: un pulgar dobla y el otro acelera y frena.
// Se eligen en el menú (Controles táctiles) o en la pausa: volante, botones ◀ ▶ o inclinar.
export const TOUCH = {
  WHEEL_TRAVEL: 0.17,   // volante: cuánto hay que deslizar el pulgar para doblar a fondo (parte del lado corto de la pantalla)
  WHEEL_DEADZONE: 0.05, // volante: zona muerta en el centro (0..1)
  WHEEL_CURVE: 1.25,    // volante: más de 1 = más fino cerca del centro
  TILT_MAX: 28,         // inclinar: grados para doblar a fondo
  TILT_DEADZONE: 2,     // inclinar: grados que no cuentan (para ir derecho sin temblar)
};

// ---------- Copiloto (voz que canta las curvas) ----------
// Tecla V: prender / apagar la voz.
// Las curvas se numeran como en el rally de verdad: 1 = muy cerrada ... 6 = casi recta.
export const COPILOT = {
  RALLY: true,          // copiloto en el rally
  CIRCUIT: false,       // copiloto en el circuito de Mónaco
  SECONDS_AHEAD: 3.2,   // cuántos segundos antes de la curva la canta
  MIN_DISTANCE: 70,     // nunca la canta a menos de esto (m)
  CHAIN: 45,            // si la siguiente curva empieza a menos de esto, dice "y ..."
  RATE: 1.15,           // velocidad de la voz
  VOLUME: 1,
};

// ---------- Multijugador ----------
export const MULTI = {
  PORT: 8787,           // puerto del servidor (npm run server)
  LOBBY_SECONDS: 15,    // cuánto se espera a que se sumen jugadores
  MAX_PLAYERS: 10,      // máximo de autos en la carrera (personas + bots)
  GRID_SIZE: 6,         // si hay menos personas, se completa con bots hasta este número
  LAPS: 3,              // vueltas de la carrera
  RESULTS_WAIT: 40,     // segundos que se espera a los demás después de que llega el primero
  BOT_SKILL: [0.8, 0.95], // qué tan rápidos son los bots (1 = al límite)
  SEND_HZ: 20,          // cuántas veces por segundo se manda la posición
};

// ---------- Sonido ----------
// Tecla M: silenciar. PULSES = explosiones por vuelta del motor (cilindros / 2): más = más agudo y suave.
// GRIT = qué tan "sucio"/ronco suena · BRIGHT = qué tan brillante (agudos)
export const AUDIO = {
  VOLUME: 0.7,          // volumen general (0 a 1)
  ENGINE: 0.55,         // volumen del motor
  SKID: 0.5,            // volumen del derrape
  HITS: 0.9,            // volumen de golpes y raspones
  WIND: 0.25,           // viento a alta velocidad
  TUNNEL_ECHO: 0.9,     // cuánto eco hay en el túnel
};

// ---------- Golpes contra guardrails y paredes ----------
export const WALL = {
  BOUNCE: 0.12,       // cuánto rebota (0 = nada). Más alto = más "pelota"
  HIT_LOSS: 0.018,    // velocidad que se pierde por cada m/s de golpe de frente
  SCRAPE: 0.15,       // cuánto frena raspando (por segundo)
  ALIGN: 3.5,         // qué tan rápido el auto se acomoda paralelo a la pared
  SPARKS: true,       // chispas al raspar
  SHAKE: 0.5,         // cuánto tiembla la cámara en un golpe fuerte
};

// ---------- Ayudas de manejo ----------
export const ASSISTS = {
  ANTI_FLIP: true,        // ayuda a que el auto no vuelque
  AIR_CONTROL: 0.6,       // cuánto se endereza solo en el aire (0 = nada)
  AUTO_RESET_SECONDS: 3,  // si está dado vuelta tanto tiempo, se reubica solo
  ABS: true,              // al frenar a fondo las ruedas no se bloquean: frena al límite y se puede doblar
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
  f1:     { x: -0.25, y: 0.36, z: 0 },
  pickup: { x: 0.1,   y: 0.38, z: -0.4 },
  luxury: { x: -0.3,  y: 0.2,  z: -0.32 },
  rally:  { x: -0.2,  y: 0.31, z: -0.36 },
  wrc:    { x: -0.22, y: 0.35, z: -0.3 },
  suv:    { x: -0.2,  y: 0.45, z: -0.38 },
  hyper:  { x: 0.02,  y: 0.3,  z: -0.3 },
};

// ---------- Mapa grande ----------
export const MAPA = {
  START_COINS: 300,     // monedas con las que se arranca
  COIN: 10,             // cuánto vale cada moneda del mapa
  BIG_COIN: 100,        // las monedas grandes (arriba de los cerros)
  COIN_RESPAWN: 120,    // segundos hasta que vuelve a aparecer una moneda agarrada
  REWARD_LAP: 40,       // por cada vuelta completa en Mónaco
  REWARD_RECORD: 100,   // extra por récord (vuelta o etapa)
  REWARD_STAGE: 150,    // por llegar al final de una etapa de rally
  REWARD_RACE: 100,     // por terminar una carrera multijugador
  PORTAL_RADIUS: 14,    // qué tan cerca hay que estar de una entrada para poder entrar
};
