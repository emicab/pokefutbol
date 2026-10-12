# PokéFútbol

Fútbol con Pokémon, arcade y de dibujos animados: placajes, rayos, bolas de
fuego y cajas sorpresa. Partido rápido 2 vs 2, 3 vs 3 o 5 vs 5 en cuatro
estadios, y un **modo historia** con club propio, niveles, IVs, evoluciones y
gimnasios. HTML + CSS + JavaScript vanilla sobre Canvas 2D, sin dependencias
ni build; la música y los sonidos se generan en el navegador.

## Jugar

Doble clic en `index.html`, o sirve la carpeta (sin caché, para desarrollar):

```bash
python tools/serve.py
```

y abre <http://localhost:8123>.

| Tecla | Acción |
|---|---|
| `WASD` / flechas | Moverse (en el saque: apuntar) |
| `J` / `Z` | Pase (toque = pase justo; mantén = más fuerte) · sin pelota: placaje |
| `K` / `X` | Tiro: mantén para cargar, suelta para patear |
| `L` / `C` | Habilidad del Pokémon |
| `Espacio` / `I` | Presionar: correr solo hacia la pelota (máx. 2 s, cansa y se enfría) |
| `Q` / `Shift` | Cambiar al compañero más cerca de la pelota |
| `T` | Orden al equipo: Neutro → Ataque → Defensa |
| `R` | Cambios (suplentes) |
| `Esc` / `P` | Pausa |
| `M` | Silenciar |

Las teclas se pueden cambiar en **Opciones → Controles** (clic en la acción y
pulsar la tecla nueva; "Restaurar teclas" vuelve a las de fábrica).

Con mando: A pase/placaje · B tiro · Y o RB habilidad · X presionar · LB cambiar ·
LT orden al equipo · Select cambios · Start pausa.

- **Saque:** el que saca empieza con la pelota y nadie se mueve hasta que la
  juega. Sólo se puede pasar.
- **Pases:** si miras más o menos hacia un compañero, la línea punteada indica
  a quién va; el control pasa al que recibe y corre solo a buscarla. Si miras
  a otro lado, es un pase al hueco. Un toque da el pase justo (la fuerza se
  calcula para que llegue según la distancia y la cancha); manteniendo la
  tecla aparece una barra azul y el pase sale más fuerte (hasta ×1,6), o más
  largo si es al hueco.
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
minutos), dificultad del rival, arquero y cancha. La cancha crece con el
formato; si no entra en pantalla, la cámara sigue la jugada y aparece un
minimapa.

Cada partido sortea de qué lado juega tu equipo.

### Arquero

- **Fijo** (por defecto en 5 vs 5): uno del equipo es el arquero todo el
  partido. Se mueve por toda el área grande: adelantado cuando la pelota está
  lejos, sobre la línea cuando se acerca. Si un rival con la pelota se acerca
  al arco y él es quien mejor llega, sale directo a cerrarle el ángulo
  (aunque sea fuera del área; las manos sólo valen dentro) y el compañero
  libre más cercano baja a cubrir el arco hasta que vuelva.
- **Dinámico** (por defecto en 2 y 3 por equipo): ataja el que esté más
  cerca de su arco en cada momento; cuando sale, lo reemplaza el siguiente.
  A veces se suma al ataque y otro queda en el arco.

El arquero lleva guantes verdes. En su área llega más lejos, atrapa los tiros
que no sean demasiado fuertes para sus reflejos (los demás los desvía), se
estira hacia donde va la pelota y, con ella en las manos, nadie se la puede
quitar (ni con placajes ni con habilidades) y nunca puede meterse un autogol:
saca con un pase o un despeje. Mientras la tiene, los rivales vuelven a su
puesto y le dejan espacio. Puede salir caminando del área con la pelota, pero
al cruzar la línea la suelta de las manos («¡SIN MANOS!»): sigue llevándola
en los pies y ya lo pueden marcar y quitársela como a cualquiera. `Q` nunca te pasa al arquero fijo.

### La CPU

El entrenador rival cambia de táctica según el partido (se ve en el
marcador): si va perdiendo se va al ataque, si gana sobre el final se cierra
atrás, y si no, varía para no ser previsible. Sus jugadores rotan de puesto:
si un defensa sube con la pelota, el compañero que quedó atrás baja a cubrir.
Cuando defienden en su mitad, los que no van a la pelota marcan a un rival
cada uno (al más peligroso primero), parados entre él y el arco. En 5 vs 5 la
marca es más floja: sólo en el último tercio, dos marcadores como mucho y más
separados.

En ataque, la CPU tira al palo que tenga la línea más libre (y si está
tapada, busca al compañero mejor ubicado), evita pases con un rival en el
medio, se abre a la banda cuando el centro está cargado, y sus medios y
delanteros se desmarcan buscando huecos con la línea de pase limpia. Lo
mismo hacen tus compañeros.

### Puestos y pizarra

Cada Pokémon tiene un puesto natural (arquero, defensa, medio o delantero)
que sale de sus stats: pesados atrás, buen tiro arriba, rápidos y
equilibrados en el medio. En la **pizarra** de la selección se arrastra a cada
uno a su posición; la profundidad decide el puesto y la ★ indica que es el
suyo, lo que da un bonus: arquero con mejores reflejos, defensa más pesado,
medio más rápido y con menos recarga, delantero con más tiro.

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
Pokémon, segundas habilidades y canchas en la selección (ver
[Plantel](#plantel)). Los legendarios se ganan con retos. Todo
se guarda en el navegador (`localStorage`); en Opciones se puede borrar.

### Energía y cambios

Los stats del Pokémon mandan en la cancha:

| Stat | En la cancha |
|---|---|
| PS | Energía máxima (aguante) |
| Velocidad | Velocidad de carrera y agilidad (acelerar, frenar, girar) |
| Ataque | Fuerza de tiro |
| PS + total de stats + tipo | Peso (choques, empujones) |

Cada Pokémon tiene energía (la barrita bajo sus pies; su máximo sale de los
PS y, en el modo historia, sube con el nivel). Se gasta corriendo,
pateando, pasando, placando y con las habilidades (más las de recarga larga),
y al recibir golpes: cuenta la **tabla de tipos**, así que un ataque súper
eficaz cansa el doble (y uno poco eficaz, mucho menos). El gasto es igual
para todos, así que a los de muchos PS (Snorlax, Lapras) les pesa menos que a
los frágiles (Pikachu, Magikarp). Se recupera trotando o quieto, y en el
banco. Cansado (menos de 40) corre más lento, patea más
flojo y recarga la habilidad más despacio; agotado (0) no puede usarla.

**Presionar** (`Espacio`) cansa mucho más que correr y dura como mucho 2
segundos seguidos; después se enfría (hasta unos 3 s; la barrita naranja bajo
la energía muestra lo que queda y la gris, la recarga). Si la mantienes
apretada, para volver a presionar hay que soltarla. Cambiar de Pokémon no
reinicia el enfriamiento.

Los tipos también deciden los golpes de las habilidades: si el rival es
**inmune** («¡No le afecta!», por ejemplo el Impactrueno contra Onix, que es
Tierra) no le hace nada, y si es **poco eficaz** tiene 50 % de aguantarlo de
pie («¡Resiste!»). El **Tiro Ígneo** de Charmander ya no es imparable: cada
rival que cruza puede frenarlo (65 % si resiste el fuego, como los de Agua o
Roca; 15 % si es neutro; nunca si es débil) y el arquero en su área suma 25 %.
Si lo frenan, el fuego se apaga y la pelota pierde fuerza.

En el partido rápido se pueden elegir hasta 2 suplentes; en el modo historia,
todo el club que no es titular está en el banco. Hay 3 cambios por partido,
con `R` (o desde la pausa). La CPU también cambia a sus cansados.

## Modo historia

Tu club es persistente; cada gimnasio se juega como una copa.

- **Club:** empiezas con un inicial (Charmander, Squirtle, Bulbasaur o
  Pikachu) y dos Pokémon más. Hasta 9 en el club y 3 titulares (3 vs 3), con
  su propia pizarra y modo de arquero.
- **Niveles e IVs:** cada partido da experiencia según lo que hizo cada uno
  (goles, asistencias, placajes, atajadas, y la victoria); los suplentes
  entrenan un poco. Cada nivel sube velocidad, tiro y peso, y cada Pokémon
  nace con IVs (0-31) que lo hacen único. La segunda habilidad se desbloquea
  al nivel 12.
- **Evoluciones:** al llegar al nivel, evolucionan (Charmander 16 →
  Charmeleon 36 → Charizard, Magikarp 20 → Gyarados, Eevee 25 → Vaporeon,
  Jolteon o Flareon a elección...).
- **Gimnasios:** 7 copas (Brock, Misty, Lt. Surge, Erika, Sabrina, Blaine y
  la Liga) de 3 partidos: dos entrenadores y el líder. Entre partido y
  partido eliges una mejora temporal (velocidad, tiro, recarga, reflejos,
  experiencia, monedas o una Poción que da otra oportunidad). Si pierdes, la
  copa se termina, pero tu club conserva la experiencia. Al ganarle al líder
  te llevas la medalla y reclutas a uno de su equipo; a veces, además, un
  Pokémon salvaje pide unirse.

Las especies del modo historia salen de la Pokédex (`js/pokedex.js`): stats
de cancha y habilidades por tipo se calculan solos (`js/species.js`), así que
cualquier Pokémon importado se puede usar.

## Online

Hasta **4 jugadores** (y los que quieran mirar), cada uno en su compu, con
una conexión directa entre navegadores (WebRTC con [PeerJS](https://peerjs.com),
que se descarga sólo al entrar en Online; el resto del juego funciona sin
internet). Se juega desde https://emicab.github.io/pokefutbol/.

1. Uno toca **Online → Crear sala** y le pasa el código de 5 letras a los demás.
2. Los demás tocan **Online**, escriben el código y **Unirse**.
3. En la sala todos entran **mirando**, y cada uno elige su lugar: **Equipo
   A**, **Equipo B** o **Mirar**. Con eso sale el partido: 1 contra 1, 2
   contra 2, 3 contra 1, o todos en un equipo contra la CPU (un equipo sin
   jugadores lo maneja la CPU, con la dificultad del anfitrión).
4. El anfitrión toca **¡Empezar!**

En cada equipo, cada jugador pone su parte de Pokémon (de su equipo del
partido rápido; el formato se reparte entre los del mismo lado) y lo que
falta se completa al azar. El formato, el tiempo, la cancha y el arquero son
los del anfitrión (los cambia con «Armar equipo» desde la sala). Sobre cada
Pokémon manejado por alguien aparece su **nombre** (el tuyo, en amarillo); el
nombre se pone en la sala. Los que miran ven el partido en vivo.

Cómo funciona: el anfitrión corre el partido y los demás le mandan sus teclas
y reciben el estado en cada paso, así que **los invitados juegan con un poco
de retraso** según la conexión. El anfitrión tiene que dejar la ventana del
juego visible (si la minimiza, el navegador frena el partido). Si alguien se
va en pleno partido, su Pokémon lo sigue la IA. Online no hay pausa (`Esc`
abre un menú para abandonar) y los cambios de suplentes son automáticos. Si
hay routers muy cerrados, la conexión puede no establecerse.

## Plantel

Están los **151 Pokémon de la primera generación**. Al principio sólo se
tienen los iniciales de siempre: **Bulbasaur, Charmander, Squirtle y
Pikachu**. El resto se compra según su fase (sólo cuentan las evoluciones de
la Gen 1), y **para comprar una evolución hay que tener su preevolución y
haber jugado partidos con ella** (5 para una fase 2, 8 para una fase 3: para
Charizard, tener a Charmeleon y 8 partidos con él). Cuenta cada partido en el
que juega (también entrando de cambio, y en el modo historia).

| Tier | Quiénes | Cuesta | Movimientos | 2º movimiento |
|---|---|---|---|---|
| Fase 1 | sin preevolución (Rattata, Eevee, Magikarp, Onix…) | 80 | 2 | 60 |
| Fase 2 | Ivysaur, Raichu, Jolteon, Golbat… | 150 + 5 partidos con su preevolución | 3 | 90 |
| Fase 3 | Venusaur, Charizard, Gengar, Alakazam, Machamp… | 300 + 8 partidos con su fase 2 | 4 | 120 |
| Fuerte | sin evolución y con muchos stats: Lapras, Aerodactyl, Scyther, Pinsir, Kangaskhan, Tauros, Electabuzz, Magmar | 300 | 3 | 120 |
| Élite | Dragonite y Gyarados (con su requisito de evolución), Snorlax | 500 | 4 | 150 |
| Legendario | Articuno (gana 3 partidos por 3+ goles), Zapdos (mete 50 goles), Moltres (gana 15 partidos), Mewtwo (gana en Difícil), Mew (gana 5 en Difícil) | reto | 4 | 200 |

Las evoluciones **aprenden más movimientos**: los suyos, los de su línea
evolutiva y los de sus tipos. Se lleva uno al partido; el primero viene con
el Pokémon y los demás se compran (el tercero y el cuarto, un poco más caros).
En la selección, tocando un movimiento con 🔒 aparece su descripción y el
botón para comprarlo. La selección tiene filtros por tier y tipo, y un
buscador.

**Equipo incompleto:** con un solo Pokémon elegido ya se puede jugar; el
resto se completa al azar (🎲) con cualquiera del plantel, casi siempre de
fase 1. Si entre los tuyos hay de fase 2 o 3, suben un poco las chances de
que salgan de esas fases.

Dieciséis tienen stats y habilidades hechas a mano:

| Pokémon | Habilidad 1 | Habilidad 2 |
|---|---|---|
| Pikachu | **Impactrueno**: aturde a los rivales cercanos | **Ataque Rápido**: embestida sin soltar la pelota |
| Charmander | **Tiro Ígneo**: bola de fuego que atraviesa y derriba | **Ascuas**: rastro de fuego |
| Squirtle | **Hidrobomba**: abanico que barre rivales y pelota | **Charco**: los rivales patinan |
| Bulbasaur | **Látigo Cepa**: trae la pelota a distancia | **Somnífero**: nube que duerme |
| Gengar | **Intangible**: 3 s sin que nadie te toque | **Teletransporte**: reaparece más adelante |
| Snorlax | **Golpe Cuerpo**: salto y onda expansiva | **Bloqueo**: muralla que rebota tiros |
| Eevee | **Adaptabilidad**: una habilidad al azar de otro | **Ataque Rápido** |
| Psyduck | **Confusión**: los rivales dan vueltas mareados | **Hidrobomba** |
| Jigglypuff | **Canto**: duerme a los rivales cercanos | **Rodar**: arrolla a todo el que se cruce |
| Machamp | **Sísmico**: agarra y lanza al rival | **Puño Dinámico**: tumba y despeja |
| Lapras | **Rayo Hielo**: suelo congelado | **Surf**: ola que arrastra todo |
| Onix | **Bloqueo** | **Excavar**: bajo tierra y sale tumbando |
| Alakazam | **Psicorrayo**: esfera que persigue al rival y lo aturde | **Teletransporte** |
| Jolteon | **Pin Misil**: cinco agujas en abanico | **Ataque Rápido** |
| Magikarp | **Salpicadura**: no pasa nada… casi nunca | **Salto**: enorme e inútil |
| Mewtwo | **Psíquico**: trae la pelota desde donde sea | **Onda Mental**: aparta a todos |

El resto saca los stats de la Pokédex (velocidad, tiro, peso y tamaño) y las
habilidades de su línea evolutiva (Charizard juega como Charmander) o de su
tipo (`js/species.js`).

## Código

```
js/core.js        espacio de nombres, medidas de la cancha por formato, utilidades
js/save.js        progreso, opciones y club (localStorage)
js/pokedex.js     tipos y stats (generado)
js/roster.js      Pokémon del partido rápido, desbloqueos y retos
js/species.js     especies del modo historia, puestos, evoluciones y gimnasios
js/stadiums.js    canchas
js/abilities.js   una función por habilidad
js/match.js       reglas, física, arquero, pelota, goles, cajas, proyectiles, cámara, repetición
js/ai.js          IA de compañeros, rivales y arqueros
js/field.js       paredes de la cancha y choques
js/render.js      dibujo de cancha, jugadores, pelota, HUD y minimapa
js/fx.js          partículas, onomatopeyas, ondas, rayos
js/sprites.js     hojas de sprites de Mundo Misterioso
js/audio.js       efectos, música y público sintetizados (WebAudio)
js/input.js       teclado y mando
js/board.js       pizarra táctica (arrastrar a cada Pokémon a su puesto)
js/ui.js          pantallas (título, opciones, selección, pausa, resultado)
js/career.js      modo historia: club, experiencia, evoluciones, copas
js/ui-career.js   pantallas del modo historia
js/net.js         online: conexión (PeerJS), sincronización del estado, teclas del invitado
js/ui-online.js   sala online (equipos A/B y espectadores) y menú durante el partido
js/main.js        bucle a 60 Hz fijo, flujo de pantallas, online y premios
tools/import_pokemon.py   copia sprites desde PokéSurvivor y regenera metadatos, Pokédex y créditos
tools/serve.py            servidor local sin caché
```

Para añadir un Pokémon, con una copia de
[PokéSurvivor](https://github.com/JPTER78/pokesurvivor) a mano:

```bash
python tools/import_pokemon.py RUTA_A_POKESURVIVOR 448 658
```

Con eso ya existe como especie para el modo historia (stats y habilidades
automáticas). Para usarlo en el partido rápido, agrégalo a `js/roster.js` con
dos habilidades de `js/abilities.js` (y su entrada en `WANTS` de `js/ai.js`
si es una habilidad nueva); para que evolucione, a `EVOLVE` de `js/species.js`.

## Licencia

Sprites de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
(CC BY-NC 4.0, **sólo uso no comercial**), tomados de
[PokéSurvivor](https://github.com/JPTER78/pokesurvivor). Autores en
[CREDITS.md](CREDITS.md). Pokémon es marca de Nintendo, Creatures y GAME FREAK;
esto es un proyecto de fans sin ánimo de lucro.
