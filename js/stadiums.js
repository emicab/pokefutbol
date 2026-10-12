/* ============ stadiums.js — canchas ============
 * grass      dos verdes (o lo que toque) para las franjas
 * traction   agarre de los Pokémon (11 = normal; menos = patinan)
 * friction   multiplica el frenado de la pelota (menos = rueda más)
 * speed      multiplica la velocidad de todos
 * hazards    zonas fijas (fracciones de la mitad de la cancha)
 * price      monedas para desbloquearla (0 = gratis)
 */
PF.STADIUMS = [
  {
    id: 'estadio', name: 'Estadio Paleta', price: 0,
    grass: ['#56b04a', '#4ea443'], track: '#2b6b3a', line: 'rgba(255,255,255,0.85)',
    traction: 11, friction: 1, speed: 1, hazards: [],
    desc: 'La cancha de siempre.',
  },
  {
    id: 'hielo', name: 'Pista Helada', price: 250,
    grass: ['#cfe8f5', '#bcdcee'], track: '#7fa9c4', line: 'rgba(60,110,170,0.75)',
    traction: 3.2, friction: 0.5, speed: 1, hazards: [],
    desc: 'Todo patina: los Pokémon y la pelota.',
  },
  {
    id: 'playa', name: 'Playa Arena', price: 250,
    grass: ['#ead08a', '#e0c27a'], track: '#3d8fb8', line: 'rgba(255,255,255,0.8)',
    traction: 9, friction: 1.7, speed: 0.88, hazards: [],
    desc: 'Arena pesada: se corre más lento y la pelota frena antes.',
  },
  {
    id: 'volcan', name: 'Cráter Volcán', price: 400,
    grass: ['#5a4038', '#4f3832'], track: '#2a1c18', line: 'rgba(255,190,140,0.7)',
    traction: 11, friction: 1, speed: 1,
    hazards: [[-0.5, -0.55], [0.5, 0.55], [-0.5, 0.55], [0.5, -0.55]],
    desc: 'Charcos de lava que queman a cualquiera, de los dos equipos.',
  },
];

PF.stadiumById = (id) => PF.STADIUMS.find((s) => s.id === id) || PF.STADIUMS[0];
