# PokéFútbol

Fútbol con Pokémon, arcade y de dibujos animados: placajes, rayos, bolas de
fuego y cajas sorpresa. 2 vs 2, 3 vs 3 o 5 vs 5, en cuatro estadios, con
Pokémon que se desbloquean jugando. HTML + CSS + JavaScript vanilla sobre
Canvas 2D, sin dependencias ni build; la música y los sonidos se generan en
el navegador.

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
| `Q` / `Shift` | Cambiar al compañero más cerca de la pelota |
| `T` | Orden al equipo: Neutro → Ataque → Defensa |
| `Esc` / `P` | Pausa |
| `M` | Silenciar |

Con mando: A pase/placaje · B tiro · Y o RB habilidad · X presionar · LB cambiar ·
LT orden al equipo · Start pausa.

- **Saque:** el que saca empieza con la pelota y nadie se mueve hasta que la
  juega. Sólo se puede pasar.
- **Pases:** si miras más o menos hacia un compañero, la línea punteada indica
  a quién va; el control pasa al que recibe y corre solo a buscarla. Si miras
  a otro lado, es un pase al hueco.
- **Tiro:** al cargar aparece la barra de potencia y, si apuntas al arco, una
  mira en la boca. `↑`/`↓` al soltar eligen palo.
- **Habilidad:** el anillo de tus Pokémon se va llenando mientras recarga y
  brilla cuando está lista. Sólo recarga con la pelota en juego.
- **Órdenes al equipo** (panel de abajo y etiqueta sobre cada uno):
  - *Neutro*: va a por la pelota el que esté más cerca; el resto cubre.
  - *Ataque*: el equipo se adelanta y sólo presiona si la tiene muy cerca.
  - *Defensa*: el equipo se queda atrás y sólo sale a presionar en tu tercio.
- **Repetición:** cada gol se repite en cámara lenta (se salta con J, K o
  Espacio; se puede quitar en Opciones).

## Partido

En la selección se elige formato (2, 3 o 5 por equipo), duración (1 a 5
minutos), dificultad del rival y cancha. La cancha crece con el formato; si
no entra en pantalla, la cámara sigue la jugada y aparece un minimapa.

| Cancha | Efecto | Precio |
|---|---|---|
| Estadio Paleta | la de siempre | gratis |
| Pista Helada | todo patina: Pokémon y pelota | 250 |
| Playa Arena | se corre más lento y la pelota frena antes | 250 |
| Cráter Volcán | charcos de lava que queman a los dos equipos | 400 |

Cajas `?`: Recarga (habilidad lista), Turbo, Gigante, Rivales lentos,
Pelota gigante, Pelota loca (hace curvas) e Imán (atrae la pelota suelta).

## Progreso

Cada partido da monedas: por jugar, ganar o empatar, cada gol y la valla
invicta, multiplicadas por la dificultad y la duración. Con ellas se compran
Pokémon y canchas en la selección. Algunos Pokémon se ganan con retos. Todo
se guarda en el navegador (`localStorage`); en Opciones se puede borrar.

## Plantel

Cada Pokémon tiene dos habilidades; se elige cuál llevar en la selección.

| Pokémon | Habilidad 1 | Habilidad 2 | Se consigue |
|---|---|---|---|
| Pikachu | **Impactrueno**: aturde a los rivales cercanos | **Ataque Rápido**: embestida sin soltar la pelota | inicial |
| Charmander | **Tiro Ígneo**: bola de fuego que atraviesa y derriba | **Ascuas**: rastro de fuego | inicial |
| Squirtle | **Hidrobomba**: abanico que barre rivales y pelota | **Charco**: los rivales patinan | inicial |
| Bulbasaur | **Látigo Cepa**: trae la pelota a distancia | **Somnífero**: nube que duerme | inicial |
| Gengar | **Intangible**: 3 s sin que nadie te toque | **Teletransporte**: reaparece más adelante | inicial |
| Snorlax | **Golpe Cuerpo**: salto y onda expansiva | **Bloqueo**: muralla que rebota tiros | inicial |
| Eevee | **Adaptabilidad**: una habilidad al azar de otro | **Ataque Rápido** | 200 |
| Psyduck | **Confusión**: los rivales dan vueltas mareados | **Hidrobomba** | 200 |
| Jigglypuff | **Canto**: duerme a los rivales cercanos | **Rodar**: arrolla a todo el que se cruce | 250 |
| Machamp | **Sísmico**: agarra y lanza al rival | **Puño Dinámico**: tumba y despeja | 350 |
| Lapras | **Rayo Hielo**: suelo congelado | **Surf**: ola que arrastra todo | 400 |
| Onix | **Bloqueo** | **Excavar**: bajo tierra y sale tumbando | 400 |
| Lucario | **Esfera Aural**: persigue al rival y lo aturde | **Velocidad Extrema** | 500 |
| Greninja | **Shuriken de Agua**: tres estrellas en abanico | **Doble Equipo**: reaparece más adelante | 600 |
| Magikarp | **Salpicadura**: no pasa nada… casi nunca | **Salto**: enorme e inútil | reto: juega 5 partidos |
| Mewtwo | **Psíquico**: trae la pelota desde donde sea | **Onda Mental**: aparta a todos | reto: gana en Difícil |

## Código

```
js/core.js        espacio de nombres, medidas de la cancha por formato, utilidades
js/save.js        progreso y opciones (localStorage)
js/roster.js      Pokémon jugables, desbloqueos y retos
js/stadiums.js    canchas
js/abilities.js   una función por habilidad
js/match.js       reglas, física, pelota, goles, cajas, proyectiles, cámara, repetición
js/ai.js          IA de compañeros y rivales
js/field.js       paredes de la cancha y choques
js/render.js      dibujo de cancha, jugadores, pelota, HUD y minimapa
js/fx.js          partículas, onomatopeyas, ondas, rayos
js/sprites.js     hojas de sprites de Mundo Misterioso
js/audio.js       efectos, música y público sintetizados (WebAudio)
js/input.js       teclado y mando
js/ui.js          pantallas (título, opciones, selección, pausa, resultado)
js/main.js        bucle a 60 Hz fijo, flujo de pantallas y premios
tools/import_pokemon.py   copia sprites desde PokéSurvivor y regenera metadatos y créditos
```

Para añadir un Pokémon, con una copia de
[PokéSurvivor](https://github.com/JPTER78/pokesurvivor) a mano:

```bash
python tools/import_pokemon.py RUTA_A_POKESURVIVOR 448 658
```

y luego agrégalo a `js/roster.js` con dos habilidades de `js/abilities.js`
(y su entrada en `WANTS` de `js/ai.js` si es una habilidad nueva).

## Licencia

Sprites de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
(CC BY-NC 4.0, **sólo uso no comercial**), tomados de
[PokéSurvivor](https://github.com/JPTER78/pokesurvivor). Autores en
[CREDITS.md](CREDITS.md). Pokémon es marca de Nintendo, Creatures y GAME FREAK;
esto es un proyecto de fans sin ánimo de lucro.
