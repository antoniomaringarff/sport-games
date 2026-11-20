# sport-games

Juego de deportes en el navegador (Three.js + Rapier + Vite). Primero: autos en Mónaco.
El plan completo está en [PLAN-SPORT-GAMES.md](PLAN-SPORT-GAMES.md).

## Jugar

```bash
npm install
npm run dev
```

Abrir http://localhost:5173, elegir auto (← →, o 1 a 4) y lugar (↑ ↓): **Mónaco – circuito**, **Mónaco – multijugador**, **Rally – Tête de Chien** o **Pista de pruebas**. Enter para arrancar.

| Tecla | Acción |
|---|---|
| W / ↑ | Acelerar |
| S / ↓ | Frenar / marcha atrás |
| A / D | Doblar |
| Espacio | Freno de mano (derrape) |
| R | Reubicar el auto |
| C | Cambiar cámara: afuera cerca, afuera lejos, conductor, frente |
| M | Silenciar / activar el sonido |
| G | Mostrar / ocultar el auto fantasma (tu mejor vuelta) |
| V | Prender / apagar la voz del copiloto |
| 1 / 2 / 3 | Cambiar de auto en el lugar |
| Enter (en Mónaco) | Reiniciar la carrera desde la grilla |
| Esc | Volver al menú |
| Q (en el menú) | Calidad gráfica: alta → media → baja (recarga la página) |

También anda con joystick (gatillos para acelerar/frenar, A = freno de mano).

## Multijugador (dos o más compus en la misma red)

En **una** compu (la que hace de servidor), en dos terminales:

```bash
npm run server
```

```bash
npm run dev:lan
```

El servidor muestra la dirección para las demás compus, por ejemplo `http://192.168.68.50:5173`.
Cada jugador abre el juego (esa dirección en las otras compus, `http://localhost:5173` en la del servidor), elige auto y **Mónaco – multijugador**.

- La sala espera **15 segundos** desde que entra el primero; se pueden sumar hasta **10**.
- Si son menos de 6, se completa con **bots** (los maneja la compu del primero que entró).
- Carrera de **3 vueltas** con semáforo común, posiciones en vivo y resultados. Enter: otra carrera.
- Todo se ajusta en `MULTI` de `src/config.js`. Para probar rápido: `LAPS=1 LOBBY=5 npm run server`.
- Si la otra compu no conecta, revisá que el firewall de la Mac deje entrar conexiones a `node`.

## Gráficos

- Luz del cielo (reflejos en autos, vidrios y mar), sombras en cascada en todo el paisaje, nubes, terreno con textura, palmeras en Mónaco.
- Humo al derrapar en asfalto, polvo en tierra/arena, marcas negras de frenada.
- Viñeta con CSS (una capa fija, casi gratis). Resolución dinámica tranquila: baja solo si el juego anda por debajo de 45 fps unos segundos, y sube cuando anduvo bien un rato.
- Abajo a la derecha: `fps · peor X ms · res Y`. Si "peor" pasa de ~25 ms seguido, se notan tirones.
- Todo en `GRAPHICS` de `src/config.js`; calidad con la tecla Q en el menú.
- Medido en un MacBook Air M4 (1512×900, calidad alta): mediana 7 ms por cuadro en Mónaco y 9,5 ms en el rally, sin cuadros de más de 20 ms mientras se maneja.

## Ajustar cómo se maneja

Todo está en [src/config.js](src/config.js), con comentarios. Cambiá un número y el juego se recarga solo.

Para medir los autos sin abrir el navegador (0-100, velocidad máxima, frenado, curvas):

```bash
node tools/sim-test.mjs f1 arena
```

Y para medir solo el frenado (metros de 100 y 200 km/h a 0):

```bash
node tools/brake-test.mjs f1
```

Frenos: `BRAKE` es lo que pide el pedal; el ABS (`ASSISTS.ABS`) lo limita a lo que agarran las gomas
(`GRIP` + `DOWNFORCE`), así no se bloquean las ruedas. `AERO_DRAG` es la resistencia del aire: al soltar
el acelerador el auto frena solo, mucho más a alta velocidad.

## Modelos de autos

Los originales (obj / fbx / gltf / glb) van en `assets-raw/` (no se sube al repo).
Se listan en [tools/cars.sources.json](tools/cars.sources.json) con el eje del frente y el largo en metros, y se convierten con:

```bash
node tools/convert-models.mjs
```

Etapas de rally (camino real de OpenStreetMap + relieve real, con lomas, ondulaciones y tramos
de tierra/ripio que agrega `tools/rally-features.mjs`):

```bash
node tools/import-rally.mjs
```

```bash
node tools/import-condor.mjs
```

Texturas del mapa (asfalto, pasto, roca, revoque, tejas): bajadas de Poly Haven (CC0) a
`assets-raw/textures/<nombre>/` y convertidas a WebP con:

```bash
node tools/convert-textures.mjs
```

Eso genera `public/assets/models/cars/<id>.glb` y `cars.json` (posición y radio de las ruedas, tamaño de la carrocería), que usa la física.
Las ruedas se detectan **por forma**, no por nombre: las piezas redondas que tocan el piso en cada esquina (las cubiertas) más todo lo que está adentro (llanta, maza, disco), aunque en el original estén pegadas a la carrocería.
El script también aplana el modelo, simplifica (`simplify` en `cars.sources.json`), junta piezas del mismo material, pasa las texturas a WebP de 1024 px y cuantiza la geometría.
Si un auto sale al revés, cambiá `forward` (`+x`, `-x`, `+z`, `-z`) en `tools/cars.sources.json`.
Para `.fbx` hace falta [FBX2glTF](https://github.com/godotengine/FBX2glTF/releases) instalado.

## Rally – Tête de Chien

Etapa de 5,2 km por caminos reales (Route de la Turbie → Avenue du Cap d'Ail → Route de la Tête de Chien), de 216 m a 542 m, en ripio.
Largada con semáforo, 3 parciales comparados con tu récord, llegada en el mirador, fantasma de tu mejor bajada.
R vuelve al camino con **+5 s** de penalización. No se puede cortar camino entre horquillas.
El **auto de rally** (tecla 4) es 4x4 y agarra mucho más en tierra que los demás.

**Copiloto**: una voz en español canta cada curva unos 3 segundos antes, como en el rally de verdad: "derecha 3", "horquilla izquierda", "izquierda 4 y derecha 2 larga" (1 = muy cerrada … 6 = casi recta). Tecla V para callarlo. En `COPILOT` de `src/config.js` se puede prender también en el circuito de Mónaco.

Se regenera con `node tools/import-rally.mjs` (usa `assets-raw/rally/osm/turbie.json` y el relieve de `assets-raw/monaco/dem`).

## Mónaco

Los datos reales se convierten una vez con:

```bash
node tools/import-monaco.mjs
```

Lee `assets-raw/monaco/` (circuito de bacinger/f1-circuits, OpenStreetMap vía Overpass y relieve Terrarium) y genera `public/assets/monaco/`:
`monaco.json` (circuito cada 2 m con altura, túnel, pianos y sectores; edificios; muelles), `terrain.bin` (relieve cercano, con la pista tallada) y `far.bin` (montañas de fondo).
El sentido de la vuelta se elige solo: la subida al Casino tiene que quedar en la primera mitad.

Para probar desde la consola del navegador: `__game.advance(segundos)` avanza el juego de golpe y `window.__autopilot` permite manejar con una función.

## Estado

- [x] Fase 0: setup
- [x] Fase 1: pista de pruebas, 3 autos con perfiles distintos, superficies, ayudas, cámara, HUD, elección de auto
- [x] Fase 2: modelos 3D de los autos (Kenney Car Kit) + pipeline de conversión + showroom
- [x] Fase 3: circuito de Mónaco (relieve real, túnel, guardrails, edificios, tribunas, modo carrera con semáforo, vueltas, sectores y récord)
- [ ] Fase 4: la ciudad completa
