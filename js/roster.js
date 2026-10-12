/* ============ roster.js — los Pokémon jugables ============
 * speed      píxeles/segundo a toda marcha
 * power      multiplica la fuerza del tiro
 * mass       empuja y aguanta los choques (Snorlax no se mueve)
 * radius     tamaño del cuerpo en la cancha
 * scale      tamaño del dibujo (sprites muy grandes, como Onix, se achican)
 * role       puesto natural (opcional; si no, sale de los stats: PF.naturalRole)
 * abilities  dos opciones; en la selección se elige cuál llevar.
 *            Cada `id` es una función de abilities.js.
 * unlock     sin él: disponible desde el principio.
 *            { coins }: se compra en la selección.
 *            { challenge, label }: se gana cumpliendo un reto (ver PF.CHALLENGES).
 */
PF.ROSTER = [
  {
    id: 'pikachu', dex: 25, name: 'Pikachu', type: 'Eléctrico', color: '#f6d32d',
    speed: 335, power: 1.0, mass: 0.95, radius: 18,
    abilities: [
      { id: 'zap', name: 'Impactrueno', cd: 9,
        desc: 'Electrocuta a los rivales cercanos: quedan aturdidos y sueltan la pelota.' },
      { id: 'quick', name: 'Ataque Rápido', cd: 5,
        desc: 'Embestida veloz sin soltar la pelota: arrolla a quien se cruce.' },
    ],
  },
  {
    id: 'charmander', dex: 4, name: 'Charmander', type: 'Fuego', color: '#ff8a3d',
    speed: 315, power: 1.12, mass: 1.0, radius: 18,
    abilities: [
      { id: 'fireshot', name: 'Tiro Ígneo', cd: 10,
        desc: 'Bola de fuego que atraviesa y derriba. Con la pelota, dispara al instante.' },
      { id: 'embers', name: 'Ascuas', cd: 9,
        desc: 'Durante 3 s dejas un rastro de fuego que tumba a los rivales que lo pisan.' },
    ],
  },
  {
    id: 'squirtle', dex: 7, name: 'Squirtle', type: 'Agua', color: '#59b8ff',
    speed: 305, power: 1.0, mass: 1.1, radius: 19,
    abilities: [
      { id: 'hydro', name: 'Hidrobomba', cd: 8,
        desc: 'Chorro en abanico que barre a los rivales y se lleva la pelota.' },
      { id: 'puddle', name: 'Charco', cd: 9,
        desc: 'Charco resbaloso delante de ti: los rivales patinan sin control 6 s.' },
    ],
  },
  {
    id: 'bulbasaur', dex: 1, name: 'Bulbasaur', type: 'Planta', color: '#5fd68a',
    speed: 300, power: 0.96, mass: 1.15, radius: 19, role: 'DEF',
    abilities: [
      { id: 'vine', name: 'Látigo Cepa', cd: 8,
        desc: 'Atrapa la pelota a distancia con un látigo, aunque la tenga un rival.' },
      { id: 'sleep', name: 'Somnífero', cd: 10,
        desc: 'Nube de esporas delante de ti: el rival que entra se queda dormido.' },
    ],
  },
  {
    id: 'gengar', dex: 94, name: 'Gengar', type: 'Fantasma', color: '#a27bff',
    speed: 322, power: 1.05, mass: 1.05, radius: 20,
    abilities: [
      { id: 'phase', name: 'Intangible', cd: 10,
        desc: '3 s atravesando a todos: nadie te roba ni te placa, y corres más.' },
      { id: 'teleport', name: 'Teletransporte', cd: 6,
        desc: 'Desapareces y reapareces más adelante, con la pelota incluida.' },
    ],
  },
  {
    id: 'snorlax', dex: 143, name: 'Snorlax', type: 'Normal', color: '#c9b79c',
    speed: 240, power: 1.28, mass: 2.4, radius: 27,
    abilities: [
      { id: 'slam', name: 'Golpe Cuerpo', cd: 9,
        desc: 'Salta y aplasta: la onda expansiva tumba a todos los rivales alrededor.' },
      { id: 'wall', name: 'Bloqueo', cd: 10,
        desc: '3,5 s hecho una muralla: inamovible, rebota tiros y rivales. Portero ideal.' },
    ],
  },

  // ------------------------------------------------ desbloqueables
  {
    id: 'eevee', dex: 133, name: 'Eevee', type: 'Normal', color: '#d9a066',
    speed: 325, power: 1.02, mass: 1.0, radius: 18, unlock: { coins: 200 },
    abilities: [
      { id: 'adapt', name: 'Adaptabilidad', cd: 8,
        desc: 'Cada vez usa una habilidad al azar de otro Pokémon. ¡Sorpresa!' },
      { id: 'quick', name: 'Ataque Rápido', cd: 5,
        desc: 'Embestida veloz sin soltar la pelota: arrolla a quien se cruce.' },
    ],
  },
  {
    id: 'psyduck', dex: 54, name: 'Psyduck', type: 'Agua', color: '#ffd84a',
    speed: 290, power: 0.95, mass: 1.05, radius: 18, unlock: { coins: 200 },
    abilities: [
      { id: 'confusion', name: 'Confusión', cd: 9,
        desc: 'Los rivales cercanos dan vueltas mareados y sueltan la pelota.' },
      { id: 'hydro', name: 'Hidrobomba', cd: 9,
        desc: 'Chorro en abanico que barre a los rivales y se lleva la pelota.' },
    ],
  },
  {
    id: 'jigglypuff', dex: 39, name: 'Jigglypuff', type: 'Hada', color: '#ff9ccf',
    speed: 285, power: 0.9, mass: 0.85, radius: 17, unlock: { coins: 250 },
    abilities: [
      { id: 'sing', name: 'Canto', cd: 12,
        desc: 'Todos los rivales cerca de ti se duermen escuchándote.' },
      { id: 'roll', name: 'Rodar', cd: 8,
        desc: 'Rueda a toda velocidad arrollando a todos los que se crucen.' },
    ],
  },
  {
    id: 'machamp', dex: 68, name: 'Machamp', type: 'Lucha', color: '#9fb6d6',
    speed: 285, power: 1.22, mass: 1.8, radius: 23, role: 'DEF', unlock: { coins: 350 },
    abilities: [
      { id: 'throw', name: 'Sísmico', cd: 9,
        desc: 'Agarra al rival más cercano y lo lanza lejos.' },
      { id: 'punch', name: 'Puño Dinámico', cd: 8,
        desc: 'Puñetazo enorme hacia delante: tumba y despeja la pelota.' },
    ],
  },
  {
    id: 'lapras', dex: 131, name: 'Lapras', type: 'Hielo', color: '#7fd4f0',
    speed: 262, power: 1.15, mass: 2.0, radius: 25, scale: 0.85, unlock: { coins: 400 },
    abilities: [
      { id: 'ice', name: 'Rayo Hielo', cd: 9,
        desc: 'Congela el suelo delante: los rivales patinan y van lentos 6 s.' },
      { id: 'surf', name: 'Surf', cd: 10,
        desc: 'Ola larga que arrastra rivales y pelota hacia delante.' },
    ],
  },
  {
    id: 'onix', dex: 95, name: 'Onix', type: 'Roca', color: '#a9a39a',
    speed: 252, power: 1.1, mass: 2.8, radius: 29, scale: 0.6, unlock: { coins: 400 },
    abilities: [
      { id: 'wall', name: 'Bloqueo', cd: 10,
        desc: '3,5 s hecho una muralla: inamovible, rebota tiros y rivales.' },
      { id: 'dig', name: 'Excavar', cd: 9,
        desc: 'Se mete bajo tierra y sale de golpe, tumbando a los de alrededor.' },
    ],
  },
  {
    id: 'alakazam', dex: 65, name: 'Alakazam', type: 'Psíquico', color: '#e8b84a',
    speed: 330, power: 1.15, mass: 1.0, radius: 19, unlock: { coins: 500 },
    abilities: [
      { id: 'psybeam', name: 'Psicorrayo', cd: 8,
        desc: 'Esfera psíquica que persigue al rival más cercano y lo aturde.' },
      { id: 'teleport', name: 'Teletransporte', cd: 6,
        desc: 'Desapareces y reapareces más adelante, con la pelota incluida.' },
    ],
  },
  {
    id: 'jolteon', dex: 135, name: 'Jolteon', type: 'Eléctrico', color: '#f6d32d',
    speed: 350, power: 1.05, mass: 0.95, radius: 18, unlock: { coins: 600 },
    abilities: [
      { id: 'pinmissile', name: 'Pin Misil', cd: 9,
        desc: 'Cinco agujas en abanico que aturden al que tocan.' },
      { id: 'quick', name: 'Ataque Rápido', cd: 5,
        desc: 'Embestida veloz sin soltar la pelota: arrolla a quien se cruce.' },
    ],
  },
  {
    id: 'magikarp', dex: 129, name: 'Magikarp', type: 'Agua', color: '#ff7a4a',
    speed: 235, power: 0.75, mass: 0.8, radius: 17,
    unlock: { challenge: 'played5', label: 'Juega 5 partidos' },
    abilities: [
      { id: 'splash', name: 'Salpicadura', cd: 3,
        desc: '¡Pero no pasa nada! ...casi nunca.' },
      { id: 'jump', name: 'Salto', cd: 5,
        desc: 'Un salto enorme por encima de todos. No hace daño, pero qué salto.' },
    ],
  },
  {
    id: 'mewtwo', dex: 150, name: 'Mewtwo', type: 'Psíquico', color: '#c58ae0',
    speed: 340, power: 1.3, mass: 1.3, radius: 21,
    unlock: { challenge: 'hardWin', label: 'Gana un partido en Difícil' },
    abilities: [
      { id: 'psychic', name: 'Psíquico', cd: 14,
        desc: 'Trae la pelota con la mente desde cualquier lugar de la cancha.' },
      { id: 'psywave', name: 'Onda Mental', cd: 10,
        desc: 'Una onda que aparta y aturde a todos los rivales a tu alrededor.' },
    ],
  },
];

/** Retos que desbloquean Pokémon. Reciben las estadísticas guardadas. */
PF.CHALLENGES = {
  played5: (st) => st.played >= 5,
  hardWin: (st) => st.hardWins >= 1,
};

PF.rosterById = (id) => PF.ROSTER.find((r) => r.id === id);

/** ¿Se puede elegir ya este Pokémon? */
PF.isUnlocked = (r) => !r.unlock || PF.Save.data.unlocked.includes(r.id);

/** Copia del Pokémon con la habilidad elegida en `def.ability`. */
PF.withAbility = (r, i) => Object.assign({}, r, { ability: r.abilities[i] || r.abilities[0] });
