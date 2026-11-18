# sport-games

Juego de deportes en el navegador (Three.js + Rapier + Vite). Primero: autos en Mónaco.
El plan completo está en [PLAN-SPORT-GAMES.md](PLAN-SPORT-GAMES.md).

## Jugar

```bash
npm install
npm run dev
```

Abrir http://localhost:5173, elegir auto (← → y Enter, o clic).

| Tecla | Acción |
|---|---|
| W / ↑ | Acelerar |
| S / ↓ | Frenar / marcha atrás |
| A / D | Doblar |
| Espacio | Freno de mano (derrape) |
| R | Reubicar el auto |
| C | Cambiar cámara |
| 1 / 2 / 3 | Cambiar de auto en el lugar |
| Esc | Volver al menú |

También anda con joystick (gatillos para acelerar/frenar, A = freno de mano).

## Ajustar cómo se maneja

Todo está en [src/config.js](src/config.js), con comentarios. Cambiá un número y el juego se recarga solo.

Para medir los autos sin abrir el navegador (0-100, velocidad máxima, frenado, curvas):

```bash
node tools/sim-test.mjs f1 arena
```

## Estado

- [x] Fase 0: setup
- [x] Fase 1: pista de pruebas, 3 autos con perfiles distintos, superficies, ayudas, cámara, HUD, elección de auto
- [ ] Fase 2: modelos 3D de los autos + showroom
- [ ] Fase 3: circuito de Mónaco
