# PokéFútbol

Fútbol con Pokémon, arcade y de dibujos animados: placajes, rayos, bolas de
fuego y cajas sorpresa. Partido rápido 2 vs 2, 3 vs 3 o 5 vs 5 en cuatro
estadios, y un **modo historia** con club propio, niveles, IVs, evoluciones y
gimnasios. HTML + CSS + JavaScript vanilla sobre Canvas 2D, sin dependencias
ni build; la música y los sonidos se generan en el navegador.

## Jugar

El menú inicial tiene cuatro modos (Partido rápido, Modo Historia, Torneo y
Online) y, debajo, Opciones y Controles (se muestran al empezar y después se
abren con el botón).

Doble clic en `index.html`, o sirve la carpeta (sin caché, para desarrollar):

```bash
python tools/serve.py
```

y abre <http://localhost:8123>.

| Tecla | Acción |
|---|---|
| `WASD` / flechas | Moverse (en el saque: apuntar) |
| `J` / `Z` | Pase (toque = pase justo; mantén = más fuerte) · sin pelota: placaje |
| `K` / `X` | Tiro: un toque ya sale fuerte; mantén para cargar más |
| `L` / `C` | Habilidad del Pokémon |
| `Espacio` / `I` | Presionar: correr solo hacia la pelota (máx. 2 s, cansa y se enfría) · con la pelota: amago |
| `Q` / `Shift` | Cambiar al compañero más cerca de la pelota |
| `T` | Orden al equipo: Neutro → Ataque → Defensa → Presión → Contra |
| `R` | Cambios (suplentes): pausa y eliges quién sale y quién entra |
| `F` | Cambio rápido, sin pausar: el suplente más fresco entra por tu K.O. (o por el que manejas, si está muy golpeado o agotado) |
| `Esc` / `P` | Pausa |
| `M` | Silenciar |

Las teclas se pueden cambiar en **Opciones → Controles** (clic en la acción y
pulsar la tecla nueva; "Restaurar teclas" vuelve a las de fábrica).

Con mando: A pase/placaje · B tiro · Y o RB habilidad · X presionar/amago · LB cambiar ·
LT orden al equipo · RT cambio rápido · Select cambios · Start pausa.

- **Saque:** el que saca empieza con la pelota y nadie se mueve hasta que la
  juega. Sólo se puede pasar.
- **Pases:** si miras más o menos hacia un compañero, la línea punteada indica
  a quién va; si no apuntas a nadie (aunque estés de espaldas), va al más
  cercano. El control pasa al que recibe, que va solo a buscarla aunque estés
  apretando otra dirección (la dirección sólo lo corre un poco). Un toque da
  el pase justo (la fuerza se calcula para que llegue según la distancia y la
  cancha); manteniendo la tecla aparece una barra azul y el pase sale más
  fuerte (hasta ×1,6).
- **Tiro:** un toque ya sale rápido y fuerte (más que un pase); manteniendo
  la tecla se carga la barra y sale todavía más fuerte. Si apuntas al arco
  aparece una mira en la boca; `↑`/`↓` al soltar eligen palo.
- **De primera:** si apretás pase (con un pase viniendo hacia vos) o tiro
  (con la pelota suelta cerca) hasta 0,4 s antes de recibirla, sale apenas la
  tocás, hacia donde apuntás con la dirección («¡DE PRIMERA!»); sin dirección,
  el tiro va al arco y el pase suele volver al que te la dio (una pared). Si
  todavía mantenés la tecla al recibir, en cambio, se carga como siempre.
- **Amago:** con la pelota, `Espacio` hace un quiebre corto y rápido hacia
  donde apuntás (sin dirección, hacia el costado del rival más cercano). El
  rival que venía a quitártela y no va hacia donde saliste queda pasado
  («¿?»): casi medio segundo sin poder placar ni robar, y más lento. Cuesta
  algo de energía y se enfría en poco más de 1 s.
- **Sin energía** para lo que cuesta, no se puede placar ni usar la habilidad
  («sin energía…»).
- **Habilidad:** el anillo de tus Pokémon se va llenando mientras recarga y
  brilla cuando está lista. Sólo recarga con la pelota en juego.
- **Órdenes al equipo** (panel de abajo y etiqueta sobre cada uno):
  - *Neutro*: va a por la pelota el que llega primero; el resto cubre.
  - *Ataque*: con la pelota el equipo sube mucho (el arquero dinámico casi
    siempre se suma) y se arriesga más: pases al espacio y gambetas aunque se
    pueda perder. Al perderla baja igual (un poco menos) y presiona arriba.
    Partidos más abiertos: se meten más goles y se reciben más.
  - *Defensa*: cuida el arco. Con la pelota suben sólo los de arriba (salida
    de contragolpe), el resto queda atrás y se juegan pases más seguros; sin
    ella se presiona a la pelota como en *Neutro* (esperar en el área le
    regala al rival el remate de media distancia). Se reciben menos goles.
  - *Presión*: presión alta en toda la cancha: además del que va a la pelota,
    cada compañero se pega a un rival del lado de la pelota para cortar el
    pase o robarla al recibir. Más robos arriba; partido abierto.
  - *Contra*: contragolpe: los de arriba quedan de salida y, al recuperarla,
    juego directo (pases al espacio, nada de tocar para atrás).

  En todas las órdenes el equipo sube cuando tiene la pelota y baja cuando la
  pierde; la orden cambia cuánto. Sin la pelota, si nadie quedó cerca del arco,
  el compañero más cercano baja a cubrirlo, y los delanteros se quedan de
  salida para el contragolpe. Los compañeros se separan si quedan pegados.
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
estira hacia donde va la pelota (el de la CPU reacciona un instante después
del tiro, a veces lo lee mal, y tras estirarse queda un momento en el piso:
un tiro fuerte al palo contrario de donde está suele ser gol) y, con ella en las manos, nadie se la puede
quitar (ni con placajes ni con habilidades) y nunca puede meterse un autogol:
saca con un pase o un despeje. Mientras la tiene, los rivales vuelven a su
puesto y le dejan espacio. Puede salir caminando del área con la pelota, pero
al cruzar la línea la suelta de las manos («¡SIN MANOS!»): sigue llevándola
en los pies y ya lo pueden marcar y quitársela como a cualquiera. `Q` nunca te pasa al arquero fijo.

### La CPU

La IA (la de la CPU y la de tus compañeros) lee el partido con la misma
física del juego: predice por dónde va a ir la pelota (cómo frena en cada
cancha y cómo rebota) y cuánto tarda cada Pokémon en llegar a cada punto
(según su velocidad, su cansancio, el agarre de la cancha y si tiene que darse
vuelta).

- **Con la pelota** compara tirar, pasar y conducir, y elige la jugada que más
  vale. Para el tiro estima la probabilidad de gol a cada punto del arco y con
  cada carga (tiempo de vuelo, reflejos y estirada del arquero, rivales que
  pueden tapar la línea, su puntería); para el pase, si algún rival llega a
  cortarlo a tiempo, y puede pasar al pie o al espacio, por delante del
  compañero; para conducir, nueve direcciones y si se la pueden quitar en el
  camino, llevando la pelota del lado contrario al rival que se acerca.
  Perderla cerca de su arco le cuesta más que perderla arriba.
- **Sin la pelota** va a buscarla el que llega primero (no el más cercano: el
  que corta la trayectoria antes). Al que la lleva lo encara del lado del arco
  y placa adelantándose a su movimiento. Si el rival la alcanza antes, se
  planta entre él y el arco. Los demás marcan al rival más peligroso (por
  dónde está y si le pueden pasar) cerrando la línea de pase, o se desmarcan
  buscando el punto donde el pase llega, hay aire para recibir y es peligroso.
- **El arquero** se para en la bisectriz del ángulo de tiro, a la profundidad
  que deja el peor «mejor tiro» posible para el rival (cuenta a sus
  defensores: si uno tapa el primer palo, él cubre el segundo). Ante un tiro
  va al primer punto de la trayectoria al que llega a tiempo, y si no llega
  caminando se estira justo a tiempo. Sale a la pelota suelta si llega antes
  que los rivales y achica en el mano a mano.

La **dificultad** cambia velocidad, reflejos, puntería, recarga del placaje y
la *lectura del juego*: en Fácil la CPU tiene «despistes» (a veces conduce
derecho al arco o corre a donde está la pelota en vez de a donde va a estar),
elige peor y su arquero se ubica a la antigua; en Difícil nunca se despista.

El entrenador rival cambia de táctica según el partido (se ve en el
marcador): si va perdiendo se va al ataque o presiona arriba, si gana sobre
el final defiende o espera de contragolpe, y si no, varía para no ser
previsible (usa las mismas cinco órdenes que tus compañeros). Sus jugadores rotan de puesto:
si un defensa sube con la pelota, el compañero que quedó atrás baja a cubrir.
En 5 vs 5 la marca es más floja: sólo en el último tercio, dos marcadores
como mucho y más separados. Los Pokémon de la IA también esquivan la lava y
los charcos del rival, y van a buscar las cajas `?` cercanas si no hay nada
urgente.

Para medir cambios en la IA hay un simulador sin pantalla que juega partidos
CPU contra CPU con el motor real (ver [Código](#código)):

```bash
node tools/sim.js --b=otra/ai.js --n=40 --size=3 --diff=hard
```

### Consejos al final del partido

En la pantalla de resultado (partido rápido, torneo, modo historia) aparecen
hasta tres consejos sacados de **tu** partido, con sus números. Para eso el
juego anota lo que hacés: cada tiro con la probabilidad de gol que tenía (el
mismo cálculo que usa la IA para decidir), tus pases y cuántos te cortaron,
las pelotas que perdiste y dónde, tus placajes, cuánto jugaste agotado o
presionando y qué orden tuvo tu equipo. Por ejemplo: «De tus 9 tiros, 6 tenían
menos de 5 % de chance de gol…», «Perdiste 3 pelotas cerca de tu arco…» o
«Probá jugar de primera…». Online sólo los ve el anfitrión.

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
se guarda en el navegador (`localStorage`); en Opciones se puede borrar, y
también se puede llevar a otro dispositivo (ver [Partida en la nube](#partida-en-la-nube)).

### Partida en la nube

En **Opciones → ☁ Partida en la nube**:

- **Activar la nube** crea un **código secreto** (`PF-XXXX-XXXX-XXXX-XXXX`, 80 bits)
  y sube tu partida (monedas, Pokémon y habilidades, club del modo historia,
  torneo en curso, estadísticas). Sin cuentas ni mails. Anota el código: es la
  única forma de recuperarla, y quien lo tenga puede leerla y reemplazarla.
- En otro dispositivo: **Ya tengo un código** → la partida baja (si ese
  dispositivo ya tiene progreso, eliges cuál conservar).
- **Se sincroniza sola**: unos segundos después de cada cambio, y al abrir el
  juego baja la versión más nueva si jugaste en otro lado. Si hay cambios en los
  dos lugares no se pisa nada: avisa y eliges cuál conservar. Borrar el progreso
  **pausa** la sincronización para no vaciar la nube por accidente. Las opciones
  de cada dispositivo (sonido, teclas) no viajan. Arriba a la derecha del menú
  inicial se ve el estado (☁ sincronizada, sin conexión…).
- **Exportar / importar** la partida a un archivo (`.json`), con o sin nube.

Cómo está hecho: la nube es un proyecto de [Supabase](https://supabase.com) con
una tabla y dos funciones (`tools/supabase.sql`). El servidor guarda sólo el
SHA-256 del código (nunca el código) y la tabla no se puede leer directamente,
sólo con `save_get` y `save_put`. La llave que está en `js/cloud.js` es la
«publishable»: es pública por diseño y sólo permite llamar a esas dos funciones (y a las del ranking).
Para usar otro proyecto, aplica `tools/supabase.sql` (y `tools/supabase-ranking.sql`) y cambia `URL` y `KEY`
en `js/cloud.js`. Si el plan gratuito del proyecto se pausa por falta de uso o
se pasa de cuota, la nube deja de responder (el juego sigue funcionando y la
partida local queda a salvo).

### Ranking

**🏅 Ranking** (en el menú inicial) es una tabla online por modo: **2 vs 2,
3 vs 3 y 5 vs 5**. Para aparecer hay que **inscribir un nombre de equipo**
(de 3 a 20 letras, único; se puede cambiar cuando quieras). Desde ahí cuentan
los partidos contra la CPU del **partido rápido** y del **torneo** (no el modo
historia ni el online):

| Resultado | Puntos | × dificultad |
|---|---|---|
| Victoria | 3 | Fácil ×1 · Normal ×2 · Difícil ×3 |
| Empate (torneo) | 1 | |
| Derrota | 0 | |

Salir o reiniciar un partido que ya lleva 30 s o más cuenta como derrota. Cada
fila muestra los puntos, partidos jugados, ganados, perdidos y goles del modo,
y **el equipo (los titulares) con el que más puntos sumaste**, con sus propios
puntos y G-P. Al terminar un partido, el resultado dice cuánto sumaste; sin
conexión, los partidos esperan en el dispositivo y se mandan después.

La inscripción queda guardada en tu partida (viaja con la nube y con los
archivos) y no se pierde al borrar el progreso. Cómo está hecho: dos tablas y
tres funciones más en el mismo proyecto de Supabase (`tools/supabase-ranking.sql`):
`rank_register`, `rank_report` (calcula los puntos en el servidor, ignora
reportes repetidos y deja mandar ~1 partido cada 45 s) y `rank_top` (los 50
primeros y tu puesto). Como el juego corre en el navegador, el ranking no es a
prueba de trampas: es para jugar entre amigos.

### Energía, vida y cambios

Los stats del Pokémon mandan en la cancha:

| Stat | En la cancha |
|---|---|
| PS | Energía máxima (aguante) y vida máxima |
| Velocidad | Velocidad de carrera y agilidad; además, cuánto rápido recupera energía |
| Ataque | Fuerza de tiro |
| PS + total de stats + tipo | Peso (choques, empujones) |

Cada Pokémon tiene **energía** (barra verde bajo sus pies) y **vida** (barra
celeste, encima de la energía; en tu equipo siempre, en el rival cuando está
golpeado). Son cosas distintas: la energía se gasta *haciendo cosas* y la vida
*recibiendo golpes*. El máximo de las dos sale de los PS y, en el modo
historia, sube con el nivel.

**Energía.** Se gasta corriendo (los pesados más), pateando, pasando, placando y
con las habilidades (más las de recarga larga). Se recupera siempre, aunque
corras, y mucho más quieto o trotando; los **veloces recuperan antes** (hasta
~60 % más rápido que los lentos) y en el banco o entre jugadas se repone rápido. Cansado (menos de 40) corre más lento, patea más flojo y recarga la
habilidad más despacio; agotado (0) no puede placar ni usar la habilidad.

**Vida y K.O.** Los choques y las habilidades desgastan la vida:
- *Peso:* en un placaje cuenta la masa de los dos. Un Meowth contra un Raichu
  (y más contra un Snorlax) apenas lo mueve, le saca poca vida y rebota (los
  muy livianos hasta se tambalean); no siempre le quita la pelota al más
  pesado. Un pesado desgasta mucho más.
- *Tipos:* el placaje usa el mejor tipo del que pega contra el golpeado (suavizado;
  las habilidades, la tabla entera: súper eficaz ≈ el doble). Un Squirtle le saca
  un poco más a un Charizard por el tipo...
- *Tier:* ...pero cada escalón de diferencia pesa ±10 % (hasta -25 %/+30 %), así que
  la ventaja de tipo de un fase 1 no compensa tanto contra un fase 3.
- Con vida 0 queda **K.O.** 7 s (translúcido, sin poder jugar ni ser tocado) y
  se levanta con 1/3 de la vida. El que manejabas pasa solo al compañero más
  cercano y aparece el aviso para el cambio rápido (`F`). La vida se recupera
  muy despacio jugando.

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
Roca; 35 % si es neutro; 20 % si es débil) y el arquero en su área suma 45 %.
Además sale bastante más despacio que antes (un 25 % menos) y empuja y aturde menos
a los rivales que atraviesa.
Si lo frenan, el fuego se apaga y la pelota pierde fuerza.

**Estados.** Algunas habilidades dejan un estado secundario (uno a la vez; la
etiqueta de color aparece sobre la cabeza). Los tipos inmunes no lo reciben:

| Estado | Efecto | Dura | Inmune |
|---|---|---|---|
| Quemado | pierde ~2 % de vida por s y tira un 15 % más flojo | 4 s | Fuego |
| Envenenado | pierde ~2 % de vida por s (un 2º impacto lo agrava) | 6 s | Veneno, Acero |
| Paralizado | 65 % de la velocidad y a veces se traba un instante | 4 s | Eléctrico |
| Congelado | inmóvil y luego lento unos segundos; un golpe de Fuego lo derrite | 1,2 s | Hielo |
| Confuso | se desvía solo y los pases le salen torcidos | 3 s | Psíquico |
| Asustado | no puede usar su habilidad | 3 s | Fantasma |

La quemadura y el veneno no dejan K.O. (se frenan en el 10 % de vida), y las
habilidades de Agua apagan tu propia quemadura.

Además de los estados de la tabla, **Drenado** (Planta): pierde vida y se la
lleva quien lo sembró (4 s; no afecta a Planta).

Movimientos nuevos ya disponibles (todos los tipos):
- **Fuego:** *Lanzallamas* (cono corto de 230 px durante 1 s, hace soltar la pelota, puede
  quemar), *Giro Fuego* (remolino que frena y lastima) y *Llamarada* (carga 0,6 s
  quieto y estalla; gasta mucha energía).
- **Agua:** *Pistola Agua* (chorro que empuja y desvía la pelota) y *Burbuja*
  (atrapa y frena 3,5 s).
- **Eléctrico:** *Onda Trueno* (paraliza; no afecta a Eléctricos ni a Tierra) y
  *Rayo* (línea instantánea que atraviesa a todos).
- **Planta:** *Drenadoras* (semilla que persigue al más cercano y lo drena 5 s: te cura con
  lo que él pierde), *Hoja Afilada* (tres hojas en abanico ancho y corto) y
  *Paralizador* (nube que paraliza).
- **Veneno:** *Bomba Lodo* (empuja, envenena y deja un charco tóxico 4 s) y
  *Niebla Tóxica* (nube grande que envenena y agrava a quien se queda).
- **Fantasma:** *Rayo Confuso* (orbe lento que confunde; no afecta a Normal ni
  Psíquico) y *Maldición* (asusta al más cercano hasta 300 px: 4 s sin habilidad).
- **Hielo:** *Ventisca* (cono ancho: frena 2,5 s a los rivales y a la pelota, 25 %
  de congelar; no afecta a Hielo).
- **Lucha:** *Patada Salto* (embestida que cuenta como mucho más pesada; si no
  toca a nadie, te tropiezas y pierdes energía) y *Contraataque* (1,2 s en guardia,
  algo más lento: el primer golpe de un rival, de habilidad o de choque, se le
  devuelve ×1,6 y lo aturde; y al que se te pega encima lo golpeas ×1,3).
- **Tierra/Roca:** *Terremoto* (fisura de 340 px que atraviesa y tumba a todos
  los que pisan el suelo, no a los Voladores) y *Lanzarrocas* (roca pesada que
  empuja fuerte y desvía la pelota).
- **Psíquico:** *Hipnosis* (duerme 1,8 s al más cercano al que miras, hasta 280
  px) y *Barrera* (escudo 2,2 s que bloquea los 2 próximos golpes y también los
  estados de los rivales).
- **Volador:** *Tornado* (cono de viento: aparta a los rivales, rechaza la
  pelota y **devuelve los proyectiles** que vienen hacia ti). Casi todos los
  Voladores son de tipo doble, así que su movimiento propio es siempre el segundo.
- **Bicho:** *Telaraña* (red de 4 s: los rivales dentro van lentísimos y la
  pelota se frena).
- **Normal:** *Hiperrayo* (cargas 0,7 s quieto con una mira visible y disparas un
  rayo de 460 px y bastante ancho que arrasa; se corrige solo hacia un rival
  casi en la mira; si te golpean antes, se corta; después quedas agotado 0,7 s) y *Descanso* (2 s quieto durmiendo: recuperas el 30 % de la
  vida; si te golpean, se corta).
- **Dragón:** *Cola Dragón* (barrido de 360° que aparta a todos y manda la pelota
  hacia ti) y *Danza Dragón* (4 s de velocidad y +25 % de tiro). Sólo hay tres
  Dragón, así que cada uno tiene sus dos movimientos propios.

Los Pokémon sin movimientos propios reciben un orden distinto dentro de su tipo,
así que dos del mismo tipo ya no repiten siempre los mismos.

En el partido rápido se pueden elegir hasta 2 suplentes; en el modo historia,
todo el club que no es titular está en el banco. Hay 3 cambios por partido,
con `R` (o desde la pausa) o, sin pausar, con `F`. En el banco el Pokémon
recupera vida y energía mucho más rápido que en la cancha, y un K.O. sentado se
levanta antes (con 1/3 de la vida); a un suplente K.O. no se lo puede meter. La
CPU también cambia a sus K.O., cansados y maltrechos.

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
  la Liga). Cada copa es un **mapa de rutas**: 4 pasos con 2-3 caminos a
  elegir y, al final, el líder. Si pierdes, la copa se termina, pero tu club
  conserva la experiencia. Al ganarle al líder te llevas la medalla y reclutas
  a uno de su equipo. Cada camino conecta con 1-2 del paso siguiente, y los
  nodos son:
  - 🧢 **Entrenador:** partido normal; premio, una mejora temporal (velocidad,
    tiro, recarga, reflejos, experiencia, monedas o una Poción que da otra
    oportunidad) y, a veces, un Pokémon que quiere unirse.
  - 🌿 **Salvajes:** partido corto (75 s) y más fácil; al ganar, uno de ellos
    se une a tu club.
  - 👑 **Élite:** rival más duro (nivel +2 a +3, IVs altos, dificultad mayor);
    premio de 120 monedas, una mejora y más chances de reclutar.
  - 💖 **Centro Pokémon:** una Poción, entrenamiento para todo el club
    (casi la mitad de un nivel) o elegir una mejora.
  - 🛒 **Tienda:** mejoras (90 monedas), Poción (130) y caramelos para todo el
    club (110).
  - ❓ **Evento:** uno de cuatro encuentros con dos opciones (un cofre, un
    veterano que entrena, un Pokémon herido, una fuente termal).

- **Azul, tu rival:** elige la línea evolutiva que le gana en tipo a tu inicial
  y te corta el paso en tres gimnasios (Celeste, Azulona y Canela): ese paso
  del mapa es obligado. Su equipo crece con vos y cada vez te dice algo antes y
  después del partido. Si le ganas, 100 monedas, una mejora y quizás un
  Pokémon. Al final de la Liga el Campeón es él.
- **Líderes con regla propia:** cada líder cambia el partido, y lo ves antes de
  jugar y pasando el mouse por su nodo del mapa. Brock: arquero con +30 % de
  reflejos. Misty: sus habilidades recargan 30 % más rápido. Surge: arranca
  ganando 1–0. Erika: tus Pokémon se cansan 25 % más rápido. Sabrina: tus
  habilidades recargan 25 % más lento. Blaine: sus tiros +15 % de potencia y
  el partido dura 90 s. El Campeón: +10 % de velocidad, +10 % de tiro y
  recarga −15 %.
- **Diálogos:** una presentación del Prof. Roble al empezar un club nuevo,
  frases de cada entrenador, líder y rival (antes y después del partido) y un
  final al ganarle a Azul en la Liga.

Las especies del modo historia salen de la Pokédex (`js/pokedex.js`): stats
de cancha y habilidades por tipo se calculan solos (`js/species.js`), así que
cualquier Pokémon importado se puede usar.

## Reglas especiales

En la pantalla de equipo (partido rápido y torneo) hay un botón **⚙ Reglas**
con atajos (Copa de bronce, Copa de élite, Colores, Barato, Fútbol puro, Muerte
súbita, Maratón) y estas opciones, que valen también para los rivales de la CPU:

- **Tipos:** sólo Pokémon con alguno de los tipos que marques (uno o varios).
- **Fases:** sólo de las fases que marques (fase 1, 2, 3, fuertes, élite o
  legendarios).
- **Tipos distintos:** los titulares no pueden compartir ningún tipo.
- **Presupuesto:** cada titular cuesta puntos según su fase (1, 2, 3, fuerte 4,
  élite 5, legendario 6); "ajustado" permite 1,5 por puesto y "medio" 2,5.
- **Fútbol puro:** sin habilidades, sólo pases, tiros y placajes.
- **Final:** normal, **gol de oro** (el primero que marca gana) o **primero a
  3 goles**.
- Sólo en los torneos: **cuadro** de 4, 8 o 16 equipos; **cada cruce** a partido
  único, ida y vuelta (resultado global; la final es única) o mejor de 3 o 5;
  **canchas rotativas** (una distinta por ronda) y, en el torneo local, **sin
  repetir** (cada Pokémon juega una sola vez en todo el torneo y eliges un
  equipo nuevo en cada cruce).

Los Pokémon que no cumplen quedan apagados en la grilla; si tu equipo no cumple,
un aviso te dice por qué y puedes quitar los que sobran con un botón.

## Torneo

Un torneo local de eliminación directa, con tu equipo del partido rápido:

- **4, 8 o 16 equipos:** el tuyo y los de la CPU, cada uno de un tipo (Llamas de
  Canela, Marea Celeste, Sombras de Lavanda…). Se elige en ⚙ Reglas → **Cuadro**
  (2, 3 o 4 rondas: octavos, cuartos, semis y final). En Difícil los equipos de
  la CPU traen Pokémon más evolucionados, como en el partido rápido.
- **Cada cruce:** también en ⚙ Reglas → **Cada cruce**: partido único, **ida y
  vuelta** (resultado global; la final es única) o **mejor de 3 / mejor de 5**
  (pasa el primero en ganar la mayoría de los partidos).
- **Tus partidos** se juegan en la cancha, con el formato, el tiempo, la
  dificultad, el arquero y la cancha que hayas elegido (si empatan, gol de oro).
  Los demás se resuelven solos según la fuerza de cada equipo, con algo de
  azar. Ves el cuadro y el rival antes de cada ronda.
- **Premios:** cada partido da sus monedas como siempre, y además se paga la
  etapa alcanzada: semifinales 50, final 120 y campeón 300 (por la dificultad,
  el tiempo y la cantidad de rondas: un cuadro de 16 paga un tercio más). Ser campeón se cuenta en tus estadísticas.
- **Se guarda:** puedes salir entre partido y partido y seguir después; si
  sales a mitad de un partido, ese partido no cuenta. Si quedas eliminado, el
  torneo se termina solo y ves quién fue el campeón.

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
4. Cada invitado que juega arma su equipo y toca **¡Estoy listo!** (cambiar de
   lugar, de equipo o de nombre lo desmarca). El anfitrión toca **¡Empezar!**,
   que sigue deshabilitado hasta que todos los invitados estén listos. La
   revancha no pide confirmación; al volver a la sala hay que marcarse de nuevo.

En cada equipo, cada jugador pone su parte de Pokémon (de su equipo del
partido rápido; el formato se reparte entre los del mismo lado) y lo que
falta se completa al azar. El formato, el tiempo, la cancha y el arquero son
los del anfitrión (los cambia con «Armar equipo» desde la sala). Sobre cada
Pokémon manejado por alguien aparece su **nombre** (el tuyo, en amarillo); el
nombre se pone en la sala, y en el marcador cada equipo muestra el nombre de
sus entrenadores («Ana + Luis»), o «CPU» si no tiene ninguno. Los que miran ven
el partido en vivo.

### Torneos online

En la sala, el anfitrión cambia el **Modo** de «Partido» a uno de los dos
torneos (con el mismo cuadro de 4, 8 o 16 equipos y las mismas series que el
torneo local). Con ⚙ Reglas elige las reglas especiales, el cuadro y la serie.

**🏆 Cooperativo:** todos los que juegan van **en el mismo equipo** (cada uno
maneja un Pokémon, el resto lo cubre la CPU) y enfrentan a los equipos de la
CPU del cuadro.

- El anfitrión lleva el cuadro y manda una copia a todos: cada uno ve el
  cuadro, el rival de la ronda y los resultados. Sólo el anfitrión toca «Jugar»;
  los invitados arrancan solos el partido, como siempre.
- El equipo de cada ronda se arma con la parte de Pokémon de cada jugador.
- Las **reglas especiales** (botón ⚙ Reglas del modo; tipos, fases, tipos
  distintos, presupuesto, fútbol puro, gol de oro, ida y vuelta, canchas
  rotativas) valen para todos; «sin repetir» no está en este modo.
- Cada jugador cobra por su cuenta las monedas de cada partido y el premio del
  torneo (semifinales 50, final 120, campeón 300, según dificultad y tiempo), y
  suma la copa si ganan. Quien entra con el torneo en marcha lo ve desde afuera.
- El cuadro vive en el anfitrión: no se guarda. Si él cierra o termina el
  torneo, todos vuelven a la sala.

**🏆 Cada uno su equipo:** hasta 4 participantes, cada uno con **su propio
equipo** (el de su «Armar equipo», con las reglas aplicadas), en el mismo
cuadro con equipos de la CPU.

- El motor online hace **un partido a la vez**: los cruces con humanos se juegan
  en cola (las idas antes que las vueltas, y las series partido a partido) y
  los demás **miran** ese partido. El cuadro muestra quién juega ahora.
- Si dos participantes se cruzan, juegan entre sí; los cruces de CPU contra CPU
  se resuelven al terminar los de humanos de la ronda.
- Cada uno cobra los premios de su equipo según hasta dónde llegó (el campeón
  300, el finalista 120, el que cae en semis 50) cuando termina el torneo.
- Si un participante se va, su equipo pasa a la CPU.

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
| Charmander | **Tiro Ígneo**: bola de fuego que atraviesa y derriba (gasta mucha energía: 20) | **Ascuas**: rastro de fuego |
| Squirtle | **Hidrobomba**: abanico que barre rivales y pelota | **Charco**: los rivales patinan |
| Bulbasaur | **Látigo Cepa**: trae la pelota desde cerca (260 px), aunque la tenga un rival | **Somnífero**: nube que duerme |
| Gengar | **Intangible**: 2,2 s sin que nadie te toque | **Teletransporte**: reaparece más adelante |
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
| Mewtwo | **Psíquico**: trae la pelota desde lejos | **Onda Mental**: aparta a todos |

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
js/tips.js        consejos al final del partido (con lo que hizo cada humano)
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
js/rules.js       reglas especiales (tipos, fases, presupuesto, fútbol puro...)
js/tournament.js  torneo local: equipos de la CPU, cuadro y resultados
js/ui-tournament.js  pantalla del cuadro del torneo
js/net.js         online: conexión (PeerJS), sincronización del estado, teclas del invitado
js/ui-online.js   sala online (equipos A/B y espectadores) y menú durante el partido
js/cloud.js       guardado en la nube (código secreto, sincronización y conflictos)
js/ui-cloud.js    pantalla «Partida en la nube» y exportar / importar archivo
js/ranking.js     ranking online por modo: inscripción, envío de resultados y pantalla
js/main.js        bucle a 60 Hz fijo, flujo de pantallas, online y premios
tools/import_pokemon.py   copia sprites desde PokéSurvivor y regenera metadatos, Pokédex y créditos
tools/serve.py            servidor local sin caché
tools/sim.js              partidos CPU contra CPU sin pantalla (Node) para comparar dos versiones de ai.js
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
