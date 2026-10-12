/* ============ roster.js — los Pokémon jugables ============
 * speed      píxeles/segundo a toda marcha
 * power      multiplica la fuerza del tiro
 * mass       empuja y aguanta los choques (Snorlax no se mueve)
 * radius     tamaño del cuerpo en la cancha
 * abilities  dos opciones; en la selección se elige cuál llevar.
 *            Cada `id` es una función de abilities.js.
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
    speed: 300, power: 0.96, mass: 1.15, radius: 19,
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
];

PF.rosterById = (id) => PF.ROSTER.find((r) => r.id === id);

/** Copia del Pokémon con la habilidad elegida en `def.ability`. */
PF.withAbility = (r, i) => Object.assign({}, r, { ability: r.abilities[i] || r.abilities[0] });
