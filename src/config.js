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
    // Sonido del motor
    SOUND: { IDLE_RPM: 4500, MAX_RPM: 15000, GEARS: 8, PULSES: 3, GRIT: 0.35, BRIGHT: 1.0, VOLUME: 0.9 },
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
    SOUND: { IDLE_RPM: 750, MAX_RPM: 5200, GEARS: 6, PULSES: 4, GRIT: 0.8, BRIGHT: 0.35, VOLUME: 1.0 },
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
    SOUND: { IDLE_RPM: 850, MAX_RPM: 7200, GEARS: 7, PULSES: 6, GRIT: 0.25, BRIGHT: 0.6, VOLUME: 0.85 },
    stats: { velocidad: 4, agarre: 4, todoterreno: 2 },
  },
  rally: {
    name: 'Auto de rally',
    color: 0x2e9b5f,
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
    BRAKE: 12,
    HANDBRAKE: 11,             // freno de mano fuerte: para cruzarlo en las horquillas
    MAX_STEER: 0.6,
    STEER_AT_SPEED: 0.15,
    STEER_SPEED: 4.4,          // volante rápido
    GRIP: 1.1,
    SIDE_GRIP: 1.0,
    REAR_GRIP_HANDBRAKE: 0.28,
    DOWNFORCE: 0.0004,
    SUSPENSION_STIFFNESS: 30,
    SUSPENSION_DAMPING: 3.4,
    SUSPENSION_TRAVEL: 0.24,   // mucho recorrido: absorbe pozos y saltos
    ANTI_ROLL: 0.45,
    // En tierra y ripio agarra mucho más que los otros
    OFFROAD: { asfalto: 1, adoquin: 1.05, tierra: 1.65, arena: 1.35, nieve: 1.6, pasto: 1.35 },
    SOUND: { IDLE_RPM: 950, MAX_RPM: 7800, GEARS: 6, PULSES: 2, GRIT: 0.65, BRIGHT: 0.75, VOLUME: 0.95 },
    stats: { velocidad: 3, agarre: 4, todoterreno: 4 },
  },
};

// ---------- Luz de cada lugar ----------
// ELEVATION: altura del sol en grados (5 = atardecer, 60 = mediodía)
// AZIMUTH: de dónde viene el sol (180 = sur/mar, 270 = oeste)
// EXPOSURE: brillo general de la imagen · SKY_LIGHT: luz del cielo que rellena las sombras
export const LIGHT = {
  monaco: {
    ELEVATION: 38, AZIMUTH: 228, SUN_COLOR: 0xfff1dc, SUN: 3.2,
    SKY_LIGHT: 1.7, EXPOSURE: 0.88, FOG: [0xcfdce6, 700, 9000],
  },
  rally: {
    ELEVATION: 34, AZIMUTH: 215, SUN_COLOR: 0xfff1dc, SUN: 3.1,
    SKY_LIGHT: 1.6, EXPOSURE: 0.86, FOG: [0xcfdce6, 900, 11000],
  },
  pista: {
    ELEVATION: 40, AZIMUTH: 210, SUN_COLOR: 0xfff0dc, SUN: 2.8,
    SKY_LIGHT: 1.3, EXPOSURE: 0.8, FOG: [0xbfd4e6, 180, 900],
  },
};

// ---------- Minimapa ----------
export const MINIMAP = {
  SIZE: 190,            // tamaño en pantalla (px)
  LOOK_AHEAD: 260,      // cuántos metros de pista que viene se pintan de color
  WARN_DISTANCE: 220,   // a cuántos metros aparece el cartel de la próxima curva
  WARN_CLOSE: 70,       // a cuántos metros el cartel empieza a titilar
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
  rally:  { x: -0.15, y: 0.45, z: -0.35 },
};
