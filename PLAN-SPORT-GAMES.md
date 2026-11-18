# PLAN — Sport Games (ciudad + autos)

> Este plan **amplía** el `plan.md` original (stack, reglas de trabajo, `config.js`, Higgsfield).
> Todo lo que dice ese archivo sigue vigente salvo donde este lo reemplaza explícitamente.
> **Todavía no se construye nada: esto es solo el plan.**

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

## 5. Fases

Cada fase termina con algo **jugable** en `npm run dev`, playtest y commit.

### Fase 0 — Setup
- [ ] Vite + Three + Rapier, estructura de carpetas de la sección 2.
- [ ] `GAME.md` con la sesión de diseño (nombres de la ciudad y los autos, colores).
- **Listo cuando:** canvas con piso y cubo a 60 fps.

### Fase 1 — Pista de pruebas de manejo (la más importante)
Antes de la ciudad: un **playground** con curvas, rectas, rampas, lomas, zona de adoquín, tierra, arena y una subida empinada.
- [ ] Vehículo Rapier con perfil configurable, step fijo, input suavizado, cámara.
- [ ] Los 3 autos como **cajas de colores** con sus perfiles distintos (F1 / camioneta / lujo).
- [ ] Superficies con fricción distinta.
- [ ] Ayudas (anti-vuelco, tracción, downforce).
- [ ] HUD: velocímetro, nombre del auto, tecla para cambiar de auto al vuelo (solo debug).
- **Listo cuando:** manejar cada auto 2 minutos ya es divertido **y** se sienten claramente distintos.

### Fase 2 — Modelos de autos + pantalla de elección
- [ ] Buscar y elegir modelos (F1, camioneta, lujo), licencias en `CREDITS.md`.
- [ ] `tools/convert-models.mjs` (obj/fbx/gltf → glb normalizado) + `cars.json`.
- [ ] Ruedas visuales que giran, doblan y siguen la suspensión.
- [ ] Showroom de elección al entrar al juego.
- **Listo cuando:** se entra, se elige uno de los 3, y se maneja en la pista con su modelo real.

### Fase 3 — El circuito de Mónaco (primero la pista, después la ciudad)
La parte más emocionante, temprano: se corre en el circuito aunque la ciudad todavía sea "maqueta".
- [ ] `tools/import-dem.mjs`: heightmap de la zona del circuito (desniveles reales).
- [ ] `tools/import-osm.mjs` (versión 1): solo el trazado del circuito + línea de costa + puerto → `circuit.json`.
- [ ] Malla de la pista sobre el terreno, pianos, vallas, túnel, mar y puerto con shader de agua, cielo con atardecer.
- [ ] Edificios a lo largo de la pista como cajas simples (de las huellas de OSM) para que se sienta encajonado.
- [ ] Modo carrera: largada, cronómetro, 3 sectores, mejor vuelta en `localStorage`, reubicar en pista.
- **Listo cuando:** dar una vuelta con el F1 es divertido y se reconocen Sainte Dévote, el Casino, la horquilla, el túnel y la Piscina.

### Fase 4 — La ciudad completa
- [ ] `import-osm.mjs` completo: todas las calles, edificios, plazas, escaleras, playa de Larvotto.
- [ ] Malla de calles con cruces, rotondas, túneles y calles a distinto nivel; aplanado del terreno.
- [ ] Edificios extruidos con receta por barrio (Le Rocher, Condamine, Monte-Carlo, Fontvieille, Larvotto, ladera).
- [ ] Hitos low-poly: Casino, Palacio, estadio, yates, faro.
- [ ] Paseo libre vs. modo carrera (vallas que aparecen/desaparecen).
- [ ] Chunks, instancing, LOD. Herramienta de debug F2 para corregir OSM.
- **Listo cuando:** atravesar Mónaco de punta a punta es agradable y se mantiene en 60 fps.

### Fase 5 — Las dos montañas
- [ ] Tête de Chien: acantilado + ruta en cornisa + mirador.
- [ ] Mont Agel: más alta, nevada arriba; serpentina con ripio; estacionamiento del centro de ski.
- [ ] Distancias comprimidas; Alpes lejanos de fondo.
- **Listo cuando:** subir con la camioneta es un placer y con el F1 es un desafío, y desde arriba se ve todo Mónaco y el mar.

### Fase 6 — Pulido + Higgsfield
- [ ] Sonido de motor por auto, eco en el túnel, derrape, choque, superficies.
- [ ] Minimapa; auto fantasma de la mejor vuelta.
- [ ] Higgsfield (con confirmación de créditos, como dice `plan.md`): fachadas por barrio, carteles inventados por el hijo (sin marcas reales), skybox, pantalla de título, fondo del showroom.

### Después (no ahora)
Rivales en la carrera, tránsito, día/noche, otros objetivos (reparto, coleccionables), **snowboard** (desde Mont Agel), **surf** (desde Larvotto), controles táctiles.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El manejo se siente "de jabón" o los autos se parecen | Fase 1 dedicada, centro de masa bajo, perfiles bien distintos, perillas en `config.js` |
| La API de vehículo de Rapier no da para algo (ej. downforce) | Se aplica como fuerza extra sobre el chasis; plan B: `cannon-es` |
| Modelos con escalas/ejes/ruedas inconsistentes | Script de normalización + manifest; la física no depende del modelo |
| Los datos de OSM vienen "sucios" (calles cortadas, huellas raras, túneles mal unidos) | Importar primero solo el circuito; limpiar con filtros + herramienta F2; plan B: dibujar a mano las calles principales |
| Mónaco es muy empinado y denso: túneles y calles a distinto nivel complican la malla | Empezar por el circuito; túneles como piezas hechas a mano; calles superpuestas por capas |
| Pista angosta + vallas = frustrante | Ayudas de frenado opcionales, rebote amable en vallas, reubicar rápido |
| Licencias (OSM, DEM, dataset de circuitos) y marcas | Atribución en `CREDITS.md` y pantalla de créditos; cero logos/sponsors reales |
| FPS con ciudad densa | Chunks, instancing, LOD, sombras limitadas, medir en cada fase |

---

## 7. Decisiones abiertas (para el game designer)

- Nombre del modo carrera (sin usar marcas oficiales) y del juego.
- ¿Manejo más arcade o más simulación? (se ajusta en Fase 1)
- ¿Cámara por defecto lejos o cerca? ¿Cámara de cockpit para el F1?
- ¿Cuántas vueltas por carrera? ¿Rivales más adelante?
- ¿Hora del día por defecto? (recomendado: atardecer)
- Carteles inventados para la ciudad y el circuito.
