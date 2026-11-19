# sport-games

Juego de deportes en el navegador (Three.js + Rapier + Vite). Primero: autos en Mónaco.
El plan completo está en [PLAN-SPORT-GAMES.md](PLAN-SPORT-GAMES.md).

## Jugar

```bash
npm install
npm run dev
```

Abrir http://localhost:5173, elegir auto (← →) y lugar (↑ ↓): **Mónaco – circuito** o **Pista de pruebas**. Enter para arrancar.

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
| 1 / 2 / 3 | Cambiar de auto en el lugar |
| Enter (en Mónaco) | Reiniciar la carrera desde la grilla |
| Esc | Volver al menú |

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

## Ajustar cómo se maneja

Todo está en [src/config.js](src/config.js), con comentarios. Cambiá un número y el juego se recarga solo.

Para medir los autos sin abrir el navegador (0-100, velocidad máxima, frenado, curvas):

```bash
node tools/sim-test.mjs f1 arena
```

## Modelos de autos

Los originales (obj / fbx / gltf / glb) van en `assets-raw/` (no se sube al repo).
Se listan en [tools/cars.sources.json](tools/cars.sources.json) con el eje del frente y el largo en metros, y se convierten con:

```bash
node tools/convert-models.mjs
```

Eso genera `public/assets/models/cars/<id>.glb` y `cars.json` (posición y radio de las ruedas, tamaño de la carrocería), que usa la física.
Las ruedas se detectan por nombre (`wheel`, `tire`, `rueda`) y tienen que ser 4 objetos separados.
Para `.fbx` hace falta [FBX2glTF](https://github.com/godotengine/FBX2glTF/releases) instalado.

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
