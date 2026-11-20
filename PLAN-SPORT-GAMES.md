# PLAN — Sport Games (ciudad + autos)

> Este plan **amplía** el `plan.md` original (stack, reglas de trabajo, `config.js`, Higgsfield).
> Todo lo que dice ese archivo sigue vigente salvo donde este lo reemplaza explícitamente.
> **Estado (18/11/2026):** Fases 0 a 3 hechas, más cámaras, minimapa y golpes contra guardrails.
> Rama `claude/sports-game-city-plan-eca3f5`, PR antoniomaringarff/sport-games#1. Ver sección 5.

---

## 1. Decisión de tecnología: Web

**Web, en el navegador.** Motivos:

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **Three.js + Rapier + Vite (web)** | Se abre con un link, HMR instantáneo, JS plano, mucha documentación, Rapier trae controlador de vehículo con raycast | Hay que armar a mano cosas que un motor trae (editor, LOD) | ✅ **Elegida** |
| Babylon.js (web) | Motor más "completo", inspector incluido | Más pesado, más opinionado | Alternativa válida |
| Godot / Unity con export web | Editor visual | Export web pesado, ciclo de iteración más lento, otro lenguaje | ❌ |
| Juego instalable | Más rendimiento | Hay que distribuir instaladores; iteración lenta | ❌ por ahora |

Si algún día se quiere instalable, el mismo build web se empaqueta con **Tauri** o **Electron** sin reescribir nada.

**Stack:** Vite (vanilla JS) · Three.js · `@dimforge/rapier3d-compat` · GLB como formato de modelos en runtime · HTML/CSS para UI · Web Audio para sonido.

---

## 2. Arquitectura pensando en varios deportes

Desde el día uno el código se separa en **núcleo compartido** y **modos de juego**, para que snowboard y surf entren después sin romper los autos.

```
sport-games/
  PLAN-SPORT-GAMES.md   GAME.md   STYLE.md   ASSETS.md   CREDITS.md
  index.html
  src/
    main.js                 # bootstrap + máquina de estados (menú → selección → juego)
    config.js               # TODAS las perillas ajustables, comentadas en español
    core/
      renderer.js           # renderer, resize, pixel ratio dinámico
      physics.js            # mundo Rapier, step fijo (60 Hz) con interpolación
      input.js              # teclado + gamepad (+ táctil más adelante)
      assets.js             # carga GLB/texturas con caché y barra de progreso
      audio.js
    world/                  # el mundo es compartido por todos los modos
      terrain.js            # heightmap: ciudad en pendiente, montaña, playa, fondo marino
      sea.js                # agua animada (shader) + línea de costa
      sky.js                # cielo, sol, niebla, hora del día
      roads/
        roadGraph.js        # grafo de calles (nodos + tramos)
        roadMesh.js         # genera malla de asfalto/veredas desde curvas
        intersections.js    # polígonos de cruces, rotondas
      city/
        districts.js        # reglas por barrio
        blocks.js           # manzanas = caras del grafo → lotes
        buildings.js        # edificios por estilo de barrio (instancing)
        props.js            # árboles, faroles, bancos, palmeras, carteles
        landmarks.js        # hitos hechos a mano
      data/
        city.json           # calles, costa y edificios importados de OpenStreetMap
        circuit.json        # trazado del circuito, pianos, sectores
        heightmap.png       # relieve (DEM real + montañas estilizadas)
    modes/
      driving/              # ← lo que construimos ahora (paseo libre + modo carrera)
        carSelect.js        # pantalla de elección de auto (showroom)
        vehicle.js          # chasis + ruedas + controlador Rapier
        vehicleProfiles.js  # perfiles F1 / camioneta / lujo
        assists.js          # control de tracción, anti-vuelco, downforce
        camera.js           # cámara de persecución
        hud.js              # velocímetro, minimapa
      race/                 # circuito: vallas, largada, cronómetro, sectores, fantasma
      snowboard/            # (futuro) se entra desde Mont Agel
      surf/                 # (futuro) se entra desde la playa de Larvotto
  public/assets/models/cars/{f1,pickup,luxury}/   # .glb normalizados
  public/assets/models/city/                     # .glb de edificios y props
  assets-raw/                                    # originales (obj/fbx/gltf) sin procesar
  tools/
    convert-models.mjs      # obj/fbx/gltf → glb normalizado y optimizado
    import-osm.mjs          # OpenStreetMap → city.json / circuit.json
    import-dem.mjs          # elevación real → heightmap
```

---

## 3. LOS AUTOS (lo más importante)

### 3.1 Los tres autos iniciales y cómo se tienen que sentir

La elección tiene que **importar**: cada auto es mejor en un lugar distinto de la ciudad.

| | **Fórmula 1** | **Camioneta (pickup/4x4)** | **Auto de lujo** |
|---|---|---|---|
| Fantasía | Pegado al piso, brutal | Indestructible, va por cualquier lado | Rápido, suave, elegante |
| Masa | ~750 kg | ~2200 kg | ~1800 kg |
| Aceleración | Muy alta | Media-baja | Alta |
| Vel. máx. | Muy alta | Media | Alta |
| Agarre en asfalto | Altísimo + **downforce** que crece con la velocidad | Medio | Alto |
| Agarre en tierra/arena/nieve | Malo (se patina, toca fondo) | **Excelente** | Medio-malo |
| Suspensión | Dura, poco recorrido | Blanda, mucho recorrido, carrocería que se inclina | Media, cómoda |
| Altura al piso | Muy baja (raspa en lomos de burro y saltos) | Alta | Media |
| Dirección | Muy directa | Lenta, radio de giro grande | Precisa |
| Derrape con freno de mano | Difícil, nervioso | Fácil y largo | Controlado, "drift elegante" |
| Dónde brilla | **Circuito de Mónaco**, túnel, Piscina | Ruta de montaña de ripio, playa | Centro, curvas del barrio en ladera |

Todos los números viven en `vehicleProfiles.js` / `config.js` con comentarios simples, para que se ajusten en el playtest.

### 3.2 Física del manejo

- **Rapier `DynamicRayCastVehicleController`**: chasis = cuerpo rígido (caja/convex hull simple), 4 ruedas raycast. **Verificar la API exacta en la doc de la versión instalada** (`createVehicleController`, `addWheel`, `setWheelEngineForce`, `setWheelSteering`, `setWheelBrake`, fricción lateral, `updateVehicle`). Plan B si algo no alcanza: `cannon-es` RaycastVehicle (misma idea).
- **Paso de física fijo a 60 Hz** con interpolación visual → el manejo se siente igual en cualquier máquina.
- **Centro de masa bajo** (lo más importante contra el "jabón" y los vuelcos).
- **Superficies**: cada collider del mundo lleva un tipo (`asfalto`, `adoquín`, `tierra`, `arena`, `nieve`, `pasto`). La rueda lee la superficie que toca y multiplica su fricción por la tabla *superficie × auto*. Además cambia sonido y partículas (polvo, arena).
- **Ayudas configurables** (`assists.js`): dirección sensible a la velocidad, control de tracción, anti-vuelco (barra estabilizadora), downforce para el F1, "auto-enderezar" suave en el aire. Cada una con perilla on/off.
- **Input analógico suavizado**: teclado con rampa de dirección (no 0→100 instantáneo), gamepad con zona muerta. W/S, A/D, Espacio = freno de mano, R = reubicar, C = cambiar cámara.
- **Cámara**: persecución con resorte, se aleja con la velocidad, sube el FOV a alta velocidad, mira hacia donde derrapás. Modo capó/cockpit opcional.
- **Choques**: rebote creíble, sacudida de cámara, sonido; sin daño por ahora.

### 3.3 Conseguir los modelos (obj / fbx / gltf → glb)

**Fuentes, en orden de preferencia** (verificar licencia de cada uno y anotar en `CREDITS.md`):
1. **Kenney – Car Kit** (CC0): tiene autos de carrera, SUV/pickup, deportivos. Se ve coherente con el low-poly.
2. **Quaternius** (CC0): packs de autos low-poly.
3. **Poly Pizza** (CC0 / CC-BY, filtrar por licencia).
4. **Sketchfab** con filtro *Downloadable + CC-BY/CC0*, buscando "formula", "pickup", "luxury car" low-poly. Bajan en glTF.

Para el F1 probablemente haya que buscar en Sketchfab/Poly Pizza; un "race car" genérico de Kenney sirve de placeholder.

**Pipeline de conversión** (`tools/convert-models.mjs`, corre en Node):

```
assets-raw/cars/<auto>/modelo.(obj|fbx|gltf|glb)
   │  .obj  → obj2gltf
   │  .fbx  → FBX2glTF  (o Blender en modo CLI si falla)
   │  .gltf → glTF-Transform (empaquetar a .glb)
   ▼
normalizar  (glTF-Transform / script propio)
   - escala real en metros (largo del auto ≈ real)
   - eje: frente del auto mirando a -Z, Y arriba
   - origen: centro del auto a nivel del piso
   - ruedas separadas y nombradas: wheel_FL, wheel_FR, wheel_RL, wheel_RR
   ▼
optimizar  (dedup, weld, texturas a 1024 / KTX2, compresión meshopt)
   ▼
public/assets/models/cars/<auto>/car.glb   +   manifest
```

**Manifest por auto** (`cars.json`) — la física **no depende** del modelo:

```json
{
  "id": "pickup",
  "name": "Camioneta",
  "model": "models/cars/pickup/car.glb",
  "wheelNodes": { "FL": "wheel_FL", "FR": "wheel_FR", "RL": "wheel_RL", "RR": "wheel_RR" },
  "wheelRadius": 0.42,
  "chassisSize": [2.0, 1.1, 5.2],
  "profile": "pickup",
  "stats": { "velocidad": 3, "agarre": 3, "todoterreno": 5 }
}
```

Si un modelo viene con las ruedas pegadas al chasis, se separan en Blender una vez (o se usan ruedas genéricas del kit). Sumar un auto nuevo = conseguir modelo + correr el script + agregar una entrada al manifest.

### 3.4 Pantalla de elección (al entrar al juego)

- Showroom 3D: plataforma giratoria con un auto a la vez, flechas ← → para cambiar, Enter para elegir.
- Barras de stats (Velocidad, Agarre, Todoterreno) desde el manifest.
- Fondo: la ciudad con la montaña y el mar desenfocados (se reutiliza el mundo).
- Se recuerda el último auto elegido (`localStorage`).
- Más adelante: garages en la ciudad para cambiar de auto sin volver al menú.

---

## 4. LA CIUDAD: Mónaco, con dos montañas y el mar

### 4.1 Por qué Mónaco encaja tan bien

Mónaco ya tiene, en la realidad, casi todo lo que queríamos:
- **Mar** al sur, con puerto lleno de yates y una playa (**Larvotto**, futuro surf).
- **Montañas** pegadas atrás: la ciudad está en una ladera que sube hacia los Alpes Marítimos. Elegimos **dos**: **Tête de Chien** (la "cabeza de perro", acantilado al oeste, más baja) y **Mont Agel** (más alta, al norte/este). En el juego exageramos un poco Mont Agel y le ponemos **nieve arriba** (futuro snowboard). En la realidad no hay nieve ni centro de ski: es una licencia del juego.
- **Calles nada cuadradas**: subidas, horquillas, túneles, escaleras, viaductos, rotondas, calles que dan vuelta a la montaña. Es lo opuesto a una grilla.
- **El circuito callejero**: el circuito de Mónaco son calles reales de la ciudad, así que la ciudad y la pista son la misma cosa.

**Criterio de fidelidad:** *reconocible, no milimétrico*. El circuito sí, lo más fiel posible (trazado, curvas, desniveles). La ciudad: trazado real de las calles principales y edificios generados a partir de las huellas reales, con estilo low-poly. Las montañas y la ruta para subirlas se **comprimen** en distancia (en la realidad Mont Agel está a varios km; en el juego queda más cerca para que el viaje dure 2–3 minutos, no 10).

**Marcas:** nada de logos ni nombres oficiales (F1, FIA, Grand Prix oficial, sponsors, hoteles o relojes reales). Los carteles los inventa el hijo (y después los genera Higgsfield). Los nombres de lugares y curvas (Sainte Dévote, Casino, Mirabeau, Tabac, Rascasse…) son geografía, se pueden usar.

### 4.2 Mapa conceptual (norte arriba, estilizado)

```
        ▲▲▲ MONT AGEL (alta, nevada: futuro snowboard) ▲▲▲
           ▲▲    ◉ centro de ski ── estacionamiento        ▲▲
   ▲▲ TÊTE DE CHIEN ▲▲    ╲╱╲╱ serpentina (La Turbie)         ▲▲
  ▲  acantilado, mirador ◎  ╲   Grande / Moyenne Corniche ════════▲
 ─────── rutas de cornisa: curvas colgadas sobre el mar, túneles ───────
   MONEGHETTI / LADERA          │           MONTE-CARLO
   horquillas, escaleras,       │   Casino ★  (curva Massenet → Casino)
   casas colgadas               │   Mirabeau → horquilla del Gran Hotel
 ───────────────┬───────────────┴──────┬──────── Portier ──┐
  FONTVIEILLE    │   LA CONDAMINE       │ Beau Rivage ↑     │  LARVOTTO
  puerto chico,  │   PUERTO HÉRCULES ⚓  │ (subida)          │  playa de arena
  estadio,       │   yates, Piscina,    │  Sainte Dévote ◯  │  (futuro surf)
  helipuerto     │   Tabac, Rascasse    │                   │
     ╲ LE ROCHER (Mónaco-Ville): roca sobre el mar,         │  TÚNEL ═══ sale a
      ╲ casco antiguo, palacio, calles angostas de piedra   │  la chicana del puerto
 ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  MAR MEDITERRÁNEO  ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈
```

### 4.3 Barrios (los reales, con su sensación de manejo)

| Barrio | Qué es | Calles | Superficie | Sensación |
|---|---|---|---|---|
| **Le Rocher / Mónaco-Ville** | Casco antiguo sobre la roca | Angostas, orgánicas, rampas de acceso en zigzag | Adoquín | Lento, técnico, vistas al mar desde arriba |
| **La Condamine** | Puerto Hércules | Bordea el puerto; buena parte del circuito | Asfalto | Abierto, yates, agua a los dos lados en la chicana |
| **Monte-Carlo** | Casino, hoteles, plaza | Subida Beau Rivage, plaza del Casino, bajada a Mirabeau y la horquilla | Asfalto | Elegante; el auto de lujo brilla acá |
| **Fontvieille** | Barrio ganado al mar, puerto chico, estadio | Más rectas y anchas | Asfalto | Avenidas rápidas, rampas en los estacionamientos |
| **Larvotto** | Playa | Avenida costera | Asfalto + arena | Velocidad junto al mar; entrada a la playa |
| **Moneghetti / ladera** | Barrios en la pendiente | Horquillas, calles que se cruzan a distinto nivel, escaleras | Asfalto | Subidas fuertes, curvas enlazadas |
| **Rutas de cornisa** | Salen de la ciudad hacia las montañas | Curvas colgadas, túneles, miradores, serpentina final | Asfalto → ripio → nieve compacta | El viaje a la montaña; la camioneta feliz, el F1 sufre |

### 4.4 Cómo se construye: importar la realidad y estilizarla

En vez de dibujar todo a mano, se **importan datos abiertos** y se generan los archivos del juego con scripts (corren una vez, el resultado se commitea).

1. **Calles, costa, edificios: OpenStreetMap** (licencia ODbL → atribución obligatoria en `CREDITS.md` y en la pantalla de créditos).
   - `tools/import-osm.mjs`: descarga por Overpass la zona de Mónaco (+ las rutas a las montañas) y extrae:
     - calles con tipo, ancho/carriles, túneles (`tunnel=yes`), puentes, superficie;
     - línea de costa, puertos, muelles, playa;
     - huellas de edificios con altura (`height` / `building:levels`) cuando existe;
     - parques, plazas, escaleras.
   - Salida: `city.json` (grafo de calles + polígonos), en metros locales.
2. **Relieve: modelo digital de elevación libre** (Copernicus DEM 30 m o SRTM, verificar licencia) → `tools/import-dem.mjs` → heightmap. Se exageran/estilizan las dos montañas a mano (pintando sobre el heightmap) y se comprime la distancia hasta ellas.
3. **Circuito**: trazado desde OSM (las calles reales) cruzado con un dataset abierto de circuitos en GeoJSON (ej. `bacinger/f1-circuits` en GitHub, **verificar licencia**). Se guarda aparte en `circuit.json` como una línea central con ancho, cordones (pianos), zonas de escape, línea de largada y 3 sectores.
4. **Generación en el juego** (igual que antes, pero alimentada con datos reales):
   - `roadMesh.js`: cada calle → curva suavizada → calzada + cordón + vereda, apoyada sobre el terreno (que se aplana debajo). Calles a distinto nivel y túneles se respetan.
   - `buildings.js`: cada huella de OSM se **extruye** con su altura, se simplifica (menos vértices) y se le aplica la "receta" del barrio (paleta, techos, balcones). Muchas huellas → se agrupan por chunk y se mergean.
   - `landmarks.js`: hechos a mano en low-poly: Casino, Palacio en la Roca, el túnel del circuito, el puerto con yates, el estadio, faro del muelle, centro de ski en Mont Agel.
   - `props.js`: palmeras, faroles, yates (instancing), barandas, carteles inventados.
5. **Retoques a mano**: la herramienta de debug (`F2`) permite mover nodos y corregir lo que OSM trae raro.

Todo detrás de la idea de siempre: **esqueleto real, relleno procedural**. Si la importación de OSM se complica, plan B: dibujar a mano en `city.json` solo el circuito + las 15–20 calles principales y generar el resto.

### 4.5 Montañas y mar

- **Mar**: shader de agua con olas, reflejo y espuma en la costa y contra los muelles; yates flotando (se mecen) en el puerto.
- **Tête de Chien**: acantilado rocoso con un mirador arriba y una ruta en cornisa. Sin nieve.
- **Mont Agel**: más alta, con nieve en la cima. Arriba: estacionamiento + base del centro de ski (punto de entrada del futuro snowboard). Ruta: serpentina con ripio en el tramo final.
- Cadena de Alpes al fondo como mallas lejanas sin colisión, perdiéndose en la niebla.
- Cielo con hora del día; recomendado: **atardecer** (el Mediterráneo con la ciudad iluminada se ve espectacular en low-poly).

### 4.6 Escala y rendimiento

- Circuito a **escala 1:1** (≈ 3,3 km; una vuelta en F1 de ~1:15–1:30 en juego).
- Ciudad ≈ 2 × 1 km: chunks de 200 × 200 m, geometría mergeada por chunk, instancing para palmeras/faroles/yates, LOD (edificios lejanos = cajas), sombras solo cerca, colliders de caja/heightfield.
- Las montañas: heightfield de menor resolución lejos de la ruta.

---

## 4b. EL CIRCUITO DE MÓNACO (modo carrera)

### Trazado (vuelta en sentido horario)
Largada en el bulevar del puerto → **Sainte Dévote** (curva cerrada a la derecha) → subida **Beau Rivage** → **Massenet** → **plaza del Casino** → bajada a **Mirabeau** → **horquilla del Gran Hotel** (la curva más lenta del calendario) → **Portier** → **el túnel** (curvo, a fondo, oscuro → luz) → **chicana del puerto** → **Tabac** → **Piscina** (chicana rápida doble) → **La Rascasse** → **Anthony Noghès** → recta de largada.

Desnivel real ~40 m: la subida a Casino y la bajada a la horquilla tienen que sentirse.

### Dos maneras de usar las mismas calles
- **Paseo libre**: la ciudad abierta, el circuito son calles normales (se puede salir por cualquier cruce).
- **Modo Gran Premio** (en el juego le ponemos otro nombre, sin marca): aparecen **guardrails/vallas**, pianos, tribunas y carteles; se cierran los cruces; hay largada con semáforo, cronómetro, 3 sectores, mejor vuelta guardada en `localStorage` y **auto fantasma** de tu mejor vuelta.
- Se puede correr con los 3 autos (la camioneta en Mónaco es parte de la gracia), pero el F1 es el que está hecho para esto.

### Específico para que el F1 se sienta bien en Mónaco
- Downforce que crece con la velocidad (agarre enorme en el túnel y la Piscina, poco en la horquilla).
- Frenadas fuertes con riesgo de bloquear ruedas (Sainte Dévote, chicana del puerto).
- Vallas pegadas: choque = rebote fuerte y pérdida de tiempo (sin daño por ahora); botón de reubicar en el último punto de la pista.
- Efectos: túnel con cambio de luz y eco del motor; chispas al tocar fondo en la bajada.

---

## 5. Estado y próximos pasos

### 5.1 Lo que ya está hecho

| Fase | Qué quedó | Notas |
|---|---|---|
| 0 — Setup | Vite + Three.js + Rapier, estructura de carpetas | `npm run dev` |
| 1 — Manejo | 3 autos con perfiles distintos, superficies, ayudas, pista de pruebas | El manejo quedó aprobado ("muy bueno"). `node tools/sim-test.mjs` mide los autos |
| 2 — Autos 3D | Kenney Car Kit, conversor obj/fbx/gltf→glb, showroom | Estilo juguete. obj/fbx sin probar con archivos reales |
| Cámaras | Afuera cerca/lejos, conductor, frente; ladeo al doblar | Perillas en `CAMERA` y `DRIVER_EYE` |
| 3 — Mónaco | Circuito real (3.330 m), relieve, túnel, guardrails, 1.284 edificios OSM, tribunas, modo carrera (luces, vueltas, sectores, récord, contramano) | `node tools/import-monaco.mjs` regenera todo |
| Extras | Minimapa con aviso de próxima curva, golpes realistas con chispas, luz por lugar (`LIGHT`), asfalto más claro | Pedido en la revisión del 18/11 |

### 5.2 Próximos pasos (en orden sugerido)

**Paso A — Pulido de la carrera (corto, alto impacto)**
- [x] **Sonido** (sintetizado con Web Audio, sin archivos): motor por auto con caja de cambios, derrape, piso, viento, golpe y raspón contra guardrail, eco en el túnel, pitidos del semáforo. Tecla M silencia. Perillas en `AUDIO` y `SOUND` de cada auto.
- [x] **Auto fantasma** de la mejor vuelta (se graba cada 0,1 s, se guarda por auto, tecla G lo oculta). Reubicar con R anula la vuelta.
- [x] **Récords** por auto en las tarjetas del menú.
- [ ] Probar vueltas reales con teclado y joystick; ajustar `WALL`, `LIGHT` y `MINIMAP` con el hijo.
- [ ] Calle de boxes (aunque sea decorativa) y más carteles/tribunas en curvas clave.

**Paso B — Multijugador y bots (carrera en Mónaco)** ✅ primera versión hecha

*Por qué va acá:* necesita el modo carrera terminado (Paso A) y reusa dos cosas de ese paso: el **auto fantasma** (grabar y reproducir un auto que no manejás vos = lo mismo que mostrar a otro jugador) y el **piloto automático** que ya usamos para probar (la base de los bots). Conviene hacerlo **antes de la ciudad**, porque es sobre el circuito, y así la ciudad nace pensando en varios autos.

*Cómo funciona para el jugador:*
1. En el menú, nuevo lugar/modo: **"Mónaco – multijugador"**.
2. Se entra a una **sala de espera de 15 segundos**: se ve la lista de jugadores que se van sumando (máximo **10**).
3. Al terminar los 15 s (o si se llena antes), los lugares vacíos se completan con **bots** hasta el tamaño de grilla elegido.
4. Todos aparecen en la grilla de largada (orden: por llegada a la sala), semáforo común, carrera de N vueltas, tabla de posiciones en vivo y resultados al final.

*Cómo se arma (versión red local, dos computadoras):*
- **Servidor chico en Node** (`server/`, con `ws`): maneja la sala, el reloj de 15 s, la largada sincronizada y los resultados. Se corre con `npm run server` en una de las compus.
- Cada compu abre el juego apuntando a esa compu (`npm run dev -- --host` y entrar a `http://IP-de-la-compu:5173`).
- **Cada jugador simula su propio auto** (manejo igual que ahora, sin lag) y manda su posición ~20 veces por segundo; los autos de los demás se dibujan **interpolados** y tienen un cuerpo físico "cinemático" para que se puedan tocar.
- **Bots**: los maneja la compu del primer jugador (el anfitrión) con el piloto automático mejorado (línea de carrera, frenada antes de curva, 3 niveles de dificultad) y los manda como si fueran jugadores.
- Después, con el Paso F, el mismo servidor se sube a internet.

*Tareas:*
- [x] `src/modes/race/ai.js`: bots que siguen la pista, frenan antes de las curvas (según la frenada y el agarre de su auto), van por su carril y se reubican si se traban.
- [x] `server/`: sala (máx. 10), cuenta de 15 s, relleno con bots hasta 6, largada sincronizada, posiciones y resultados (los que no llegaron, ordenados por lo que recorrieron).
- [x] `src/net/`: conexión, reloj compartido con el servidor, envío de posición 20 veces por segundo; autos remotos interpolados, con nombre arriba y cuerpo para chocarse.
- [x] HUD: sala de espera con nombre, posición (P2/6) y tabla en vivo, pantalla de resultados, Enter para otra carrera.
- [x] Probado con dos pestañas del navegador (dos clientes) y bots: sala, largada, posiciones, llegada y resultados.
- [ ] **Probar entre dos computadoras de verdad** en la misma red (y revisar el firewall).
- [ ] Si el anfitrión se va en medio de la carrera, los bots quedan quietos: pasarle los bots al siguiente jugador.
- [ ] Sonido del motor de los demás autos (hoy solo suena el propio).
- [ ] Bots más rápidos/variados y que se esquiven entre ellos.

**Rally en la Tête de Chien** ✅ primera versión hecha (pedido del 19/11)
- [x] Auto de rally (Kenney `hatchback-sports`): 4x4, liviano, suspensión larga, mucho agarre en tierra, freno de mano fuerte.
- [x] Etapa de 5,2 km por caminos reales de OSM (Route de la Turbie → Avenue du Cap d'Ail → Route de la Tête de Chien), 216 → 542 m, 4 horquillas.
- [x] Ripio, banquinas, postes, pinos/arbustos/piedras (los cercanos se chocan), arcos de largada/parciales/llegada, Mónaco y el mar de fondo.
- [x] Modo rally: semáforo, 3 parciales contra el récord, llegada, récord y fantasma por auto, +5 s por reubicar, no se puede cortar entre horquillas.
- [x] Minimapa y cartel de próxima curva (sirven de "copiloto") para caminos abiertos.
- [x] Copiloto con voz (Web Speech, español): notas de ruta automáticas 1–6 / horquilla, "larga", encadenadas con "y", cantadas ~3 s antes según la velocidad; tecla V. También disponible en Mónaco (`COPILOT.CIRCUIT`).
- [ ] Más etapas (bajada, de noche, con niebla) y polvo detrás del auto.
- [ ] Rally multijugador (largadas cada 30 s contra el reloj).

**Mejora gráfica** ✅ (pedido del 19/11)
- [x] Luz del cielo (IBL con un cielo degradé; el disco del sol saturaba todo), menos luz en el túnel.
- [x] Sombras en cascada (CSM) en todo el paisaje; materiales preparados solos.
- [x] Nubes, terreno con textura de detalle, mar con reflejos, palmeras en Mónaco, estudio con reflejos en el showroom.
- [x] Humo, polvo y marcas de frenada.
- [x] Calidad alta/media/baja (tecla Q), resolución dinámica, color y viñeta por CSS.
- Se probó un posproceso completo (bloom + MSAA en buffer HDR): costaba ~15 ms por cuadro, se descartó.
- [ ] Posibles siguientes: autos con pintura propia (no la paleta de Kenney), luces de freno, ventanas con reflejo/variedad, agua con espuma en la costa.

**Autos realistas** ✅ (pedido del 19/11)
- [x] F1 Audi R26, camioneta Lightbody Lifted '85, auto de lujo Ferrari F40 LB-Works, rally Porsche 911 (996), de Sketchfab.
- [x] `convert-models.mjs`: ruedas por forma, simplificación (meshoptimizer), juntar por material, texturas WebP 1024, cuantización. 11 MB los cuatro (eran 130 MB).
- [x] Sombra con un molde simple (envoltura convexa + cilindros): Mónaco quedó en ~5,7 ms por cuadro.
- [ ] Ferrari y Porsche son CC-BY-NC-SA y los tres son marcas reales: reemplazar antes de publicar o vender.
- [ ] Luces de freno que se prendan y volante que gire en la vista conductor.

**Paso C — La ciudad completa (Fase 4)**
- [ ] Importar todas las calles de OSM con cruces, rotondas, túneles y calles a distinto nivel (en `import-monaco.mjs`).
- [ ] **Paseo libre**: el circuito se abre a la ciudad (sin vallas, con cruces); el **modo carrera** vuelve a cerrar todo.
- [ ] Barrios con su "receta" (Le Rocher con adoquín, Monte-Carlo, Fontvieille, Larvotto con la playa).
- [ ] Hitos low-poly: Casino, Palacio, puerto con yates, estadio, faro.
- [ ] Colisión de edificios (cajas simples) para el paseo libre.
- [ ] Rendimiento: chunks, LOD, instancing (medir en la notebook del hijo).

**Paso D — Las dos montañas (Fase 5)**
- [x] Tête de Chien: hecha como etapa de rally (ver arriba).
- [ ] Mont Agel: serpentina con nieve arriba (para el snowboard).
- [ ] Estacionamiento del centro de ski (futura entrada al snowboard).
- [ ] Distancias comprimidas para que el viaje dure 2–3 minutos.

**Paso E — Identidad (Fase 6, Higgsfield)**
- [ ] `STYLE.md` con el hijo; lista de assets con cantidad de generaciones y **confirmación antes de gastar créditos**.
- [ ] Fachadas por barrio, carteles inventados, cielo, pantalla de título, fondo del showroom, colores/livery de los autos.

**Paso F — Publicar (cuando quieran)**
- [ ] Servidor de multijugador en internet (hoy solo red local): hosting del servidor WebSocket (Fly.io, Render o similar), con confirmación.
- [ ] Deploy web (GitHub Pages o Vercel), solo con confirmación.
- [ ] Partir el bundle (hoy ~4,9 MB por el WASM de Rapier) para que cargue más rápido.

**Después:** snowboard (desde Mont Agel), surf (desde Larvotto), controles táctiles, tránsito, día/noche.

### 5.3 Deuda técnica conocida
- En pruebas largas del rally, dos veces el cuerpo físico del auto apareció *deshabilitado* (quedaba flotando). No se encontró la causa; `vehicle.js` lo reactiva y avisa en la consola. Investigar si vuelve a aparecer.
- `import-rally.mjs` repite funciones de `import-monaco.mjs` (proyección, relieve, curvas): juntarlas en `tools/lib/`.
- El relieve viene de datos de ~30 m: algunas pendientes del circuito quedan suavizadas.
- Edificios sin colisión (hoy no importa porque los guardrails contienen el auto).
- `window.__autopilot` y `__game.advance()` son ganchos de prueba: dejarlos, pero no usarlos en el juego.
- El panel de vista previa del editor pausa la animación cuando no está a la vista: medir FPS siempre en un navegador normal.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El sonido sintetizado suena "a juguete" | Empezar con Web Audio (gratis); si no convence, buscar SFX CC0 (Kenney Audio, freesound CC0) |
| La ciudad completa de OSM trae calles "sucias" y muchos cruces | Importar por barrios; herramienta F2 para corregir; plan B: solo calles principales |
| FPS con ciudad + montañas | Chunks, LOD, sombras solo cerca, medir en cada paso |
| Licencias (OSM, Terrain Tiles, Kenney, Higgsfield) y marcas | `CREDITS.md` al día; cero logos/sponsors reales |
| El chico pierde interés | Pasos cortos que terminan en algo jugable; dejarle retos en `config.js` |

---

## 7. Definiciones que hacen falta (para decidir con el hijo)

Las primeras tres cambian lo que se construye en los Pasos A, B y C; conviene decidirlas ya.

1. **Carrera: ¿cuántas vueltas?** Y en modo un jugador, ¿también rivales bot (salen gratis del Paso B) o solo contrarreloj + fantasma?
   - **Multijugador:** ¿a cuántos autos se completa la grilla con bots (por ejemplo 6, o siempre 10)? ¿Los jugadores pueden elegir auto distinto o todos el mismo? ¿Choques entre autos sí o no?
2. **Paseo libre por la ciudad: ¿para qué?** Solo pasear, o con un objetivo (repartos, coleccionables, desafíos de tiempo entre dos puntos). ¿Con tránsito?
3. **Estilo de los autos**: seguir con los autos "juguete" de Kenney o pasar a modelos más realistas (hay un F1 más fino en el Racing Kit). ¿Se pueden elegir colores? ¿Sumamos más autos?
4. **Dificultad del manejo**: ¿un selector arcade/simulación (ayudas on/off) o un solo nivel?
5. **Daño**: ¿los golpes rompen el auto (se ve abollado, anda peor) o solo frenan?
6. **Hora del día**: fija (tarde luminosa, como ahora), elegible en el menú, o ciclo día/noche.
7. **Sonido y música**: ¿motor sintetizado o grabado? ¿Música en el menú y en carrera?
8. **Montañas**: ¿qué tan cerca de la ciudad? ¿Mont Agel nevado siempre?
9. **Controles**: teclado y joystick ya están; ¿hace falta celular/táctil?
10. **Nombre del juego y del modo carrera** (sin marcas oficiales).
11. **Higgsfield**: presupuesto de imágenes y qué va primero (pantalla de título, carteles, fachadas).
12. **Publicar**: ¿cuándo y dónde? (link para amigos, GitHub Pages, Vercel). Para jugar multijugador por internet hace falta además un servidor.
