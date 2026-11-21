// theme.js — the SOLMAR palette: a sun-soaked pastel coast city by day, neon
// after dark. Shared by the canvas renderer and the headless screenshot
// renderer so both draw the same world.
export const COLORS = {
  water: '#177e9c',
  waterDeep: '#0f5d78',
  waterFoam: '#bfeaf2',
  sand: '#eed49b',
  sandWet: '#e0c184',
  grass: '#63a851',
  grassDark: '#4c8a3e',
  parkPath: '#d9c491',
  road: '#3a3f47',
  roadDark: '#31353d',
  lane: '#f7dc6f',
  crosswalk: '#e8e8e8',
  sidewalk: '#b7bcc4',
  sidewalkEdge: '#9aa0a8',
  plaza: '#cfc4ae',
  runway: '#4a4f57',
  roofLight: '#e8e2d4',
  pier: '#8a6f4d',
  palmTrunk: '#8a6844',
  palmLeaf: '#2f9e57',
  palmLeafDark: '#238047',
  player: '#ffcf3f',
  playerSkin: '#c68863',
  cop: '#274bdb',
  copCarBody: '#f2f3f5',
  copCarTrim: '#1c2733',
  lightRed: '#ff3b30',
  lightBlue: '#2e7bff',
  headlight: '#fff3b0',
  hudPanel: 'rgba(10,14,20,0.62)',
  hudText: '#ffffff',
  hudAccent: '#ffd23f',
  hudDanger: '#ff5252',
  star: '#ffd23f',
  marker: '#ffd23f',
  markerGreen: '#58e08a',
  dialoguePanel: 'rgba(8,10,16,0.88)',
};

// Building facades by district flavour: downtown glass, mid pastel, suburb warm.
export const BUILDING_PALETTES = {
  downtown: ['#7fb2d9', '#5d8fb8', '#93c4de', '#6f7fc9', '#4f6f9f', '#88a8c8'],
  mid: ['#f2c14e', '#ef8354', '#e07a5f', '#81b29a', '#f2cc8f', '#e5989b', '#b5838d'],
  suburb: ['#f4e1c1', '#eac9a0', '#d9a066', '#cfe0c3', '#f0d5b5', '#e3b7a0'],
  special: ['#f6f1e7'],
};

export const ROOF_COLORS = ['#8d8577', '#7a7264', '#9a917f', '#6e675b', '#a39a86'];

export const CAR_COLORS = [
  '#e74c3c', '#ecf0f1', '#3498db', '#f39c12', '#2ecc71', '#9b59b6',
  '#1abc9c', '#e67e22', '#fd79a8', '#95a5a6', '#34495e', '#f1c40f',
  '#00b894', '#6c5ce7', '#d63031', '#74b9ff',
];

export const PED_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b',
  '#6ab04c', '#c7ecee', '#e77f67', '#3dc1d3', '#f8a5c2', '#778ca3',
];

// How dark the night overlay gets (0 = noon, 1 = deepest night) for a clock
// time in minutes; also used for the warm dawn/dusk tint strength.
export function nightFactor(minutes) {
  const h = minutes / 60;
  if (h < 5) return 1;
  if (h < 7) return 1 - (h - 5) / 2; // dawn
  if (h < 17) return 0;
  if (h < 20) return (h - 17) / 3; // dusk
  return 1;
}

export function duskFactor(minutes) {
  const h = minutes / 60;
  if (h >= 6 && h < 9) return 1 - Math.abs(h - 7.5) / 1.5;
  if (h >= 17 && h < 20) return 1 - Math.abs(h - 18.5) / 1.5;
  return 0;
}
