# PokéFútbol

Fútbol 2 vs 2 con Pokémon, arcade y de dibujos animados: placajes, rayos,
bolas de fuego y cajas sorpresa. HTML + CSS + JavaScript vanilla sobre
Canvas 2D, sin dependencias ni build.

## Jugar

Doble clic en `index.html`, o sirve la carpeta:

```bash
python -m http.server 8123
```

y abre <http://localhost:8123>.

| Tecla | Acción |
|---|---|
| `WASD` / flechas | Moverse (en el saque: apuntar) |
| `J` / `Z` | Pase · sin pelota: placaje |
| `K` / `X` | Tiro: mantén para cargar, suelta para patear |
| `L` / `C` | Habilidad del Pokémon |
| `Espacio` / `I` | Presionar: correr solo hacia la pelota |
| `Q` / `Shift` | Cambiar de Pokémon |
| `T` | Orden al compañero: Neutro → Ataque → Defensa |
| `Esc` / `P` | Pausa |
| `M` | Silenciar |

Con mando: A pase/placaje · B tiro · Y o RB habilidad · X presionar · LB cambiar ·
LT orden al compañero · Start pausa.

- **Órdenes al compañero** (lo ves en el panel de abajo y sobre su cabeza):
  - *Neutro*: va a por la pelota el que esté más cerca; el otro cubre.
  - *Ataque*: se queda arriba desmarcado y sólo presiona si la tiene muy cerca.
  - *Defensa*: se queda entre la pelota y tu arco y sólo sale a presionar en
    tu tercio de la cancha.

- **Saque:** el que saca empieza con la pelota y nadie se mueve hasta que la
  juega. Apunta y pasa o tira.
- **Pases:** si miras más o menos hacia tu compañero, la línea punteada indica
  que el pase va a él; el control pasa al que recibe y corre solo a buscarla.
  Si miras a otro lado, es un pase al hueco.
- **Tiro:** al cargar aparece la barra de potencia y, si apuntas al arco, una
  mira en la boca. `↑`/`↓` al soltar eligen palo.
- **Habilidad:** el anillo de tus Pokémon se va llenando mientras recarga y
  brilla cuando está lista.

## Plantel

Cada Pokémon tiene dos habilidades; se elige cuál llevar en la selección.

| Pokémon | Habilidad 1 | Habilidad 2 |
|---|---|---|
| Pikachu | **Impactrueno**: aturde a los rivales cercanos | **Ataque Rápido**: embestida sin soltar la pelota |
| Charmander | **Tiro Ígneo**: bola de fuego que atraviesa y derriba | **Ascuas**: rastro de fuego durante 3 s |
| Squirtle | **Hidrobomba**: abanico de agua que barre rivales y pelota | **Charco**: los rivales patinan |
| Bulbasaur | **Látigo Cepa**: trae la pelota a distancia | **Somnífero**: nube que duerme |
| Gengar | **Intangible**: 3 s sin que nadie te toque | **Teletransporte**: reaparece más adelante |
| Snorlax | **Golpe Cuerpo**: salto y onda expansiva | **Bloqueo**: muralla que rebota tiros |

Cajas `?` en la cancha: Recarga (habilidad lista), Turbo, Gigante y Rivales
lentos.

## Código

```
js/core.js        espacio de nombres, medidas de la cancha, utilidades
js/roster.js      Pokémon jugables (stats y habilidad)
js/abilities.js   una función por habilidad
js/match.js       reglas, física, pelota, goles, cajas
js/ai.js          IA de compañeros y rivales
js/field.js       paredes de la cancha y choques
js/render.js      dibujo de cancha, jugadores, pelota y HUD
js/fx.js          partículas, onomatopeyas, ondas, rayos
js/sprites.js     hojas de sprites de Mundo Misterioso
js/audio.js       efectos sintetizados (WebAudio)
js/input.js       teclado y mando
js/ui.js          pantallas (título, selección, pausa, resultado)
js/main.js        bucle a 60 Hz fijo y flujo de pantallas
```

Para añadir un Pokémon: copia sus hojas de SpriteCollab a
`assets/pokemon/{dex}/`, su entrada a `js/sprites-meta.js`, y agrégalo a
`js/roster.js` con una habilidad de `js/abilities.js`.

## Licencia

Sprites de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
(CC BY-NC 4.0, **sólo uso no comercial**), tomados de
[PokéSurvivor](https://github.com/JPTER78/pokesurvivor). Autores en
[CREDITS.md](CREDITS.md). Pokémon es marca de Nintendo, Creatures y GAME FREAK;
esto es un proyecto de fans sin ánimo de lucro.
