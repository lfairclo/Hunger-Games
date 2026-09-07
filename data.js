// ============================================================================
// DATA POOLS — locations, items, traits, names, flavor fragments
// Pure data + small helpers. No DOM. Safe to run under Node or a browser.
// ============================================================================

const LOCATIONS = [
  { id: 'cornucopia', name: 'The Cornucopia', tags: ['exposed', 'hub'],
    connections: ['forestN', 'forestS', 'river', 'ridge', 'meadow'] },
  { id: 'forestN', name: 'Northern Timberline', tags: ['forest', 'cover'],
    connections: ['cornucopia', 'caves', 'ridge'] },
  { id: 'forestS', name: 'Southern Thicket', tags: ['forest', 'cover'],
    connections: ['cornucopia', 'marsh', 'orchard'] },
  { id: 'river', name: 'River Bend', tags: ['water', 'exposed'],
    connections: ['cornucopia', 'marsh', 'lake'] },
  { id: 'ridge', name: 'Rocky Ridge', tags: ['exposed', 'high'],
    connections: ['cornucopia', 'forestN', 'cliffs'] },
  { id: 'meadow', name: 'Golden Meadow', tags: ['exposed', 'food'],
    connections: ['cornucopia', 'orchard', 'ruins'] },
  { id: 'caves', name: 'The Hollow Caves', tags: ['shelter', 'dark'],
    connections: ['forestN', 'cliffs'] },
  { id: 'marsh', name: 'The Marshlands', tags: ['water', 'dangerous'],
    connections: ['forestS', 'river', 'lake'] },
  { id: 'orchard', name: 'Wild Orchard', tags: ['food', 'cover'],
    connections: ['forestS', 'meadow', 'ruins'] },
  { id: 'lake', name: 'Still Lake', tags: ['water', 'exposed'],
    connections: ['river', 'marsh'] },
  { id: 'cliffs', name: 'The Cliffs', tags: ['high', 'dangerous'],
    connections: ['ridge', 'caves'] },
  { id: 'ruins', name: 'Old Ruins', tags: ['shelter', 'cover'],
    connections: ['meadow', 'orchard'] },
];

// x/y are percentages, used to lay the map out on a fixed 0-100 grid.
const LOCATION_COORDS = {
  cornucopia: { x: 50, y: 50 },
  forestN: { x: 42, y: 22 },
  forestS: { x: 38, y: 78 },
  river: { x: 74, y: 40 },
  ridge: { x: 22, y: 32 },
  meadow: { x: 66, y: 68 },
  caves: { x: 18, y: 12 },
  marsh: { x: 62, y: 88 },
  orchard: { x: 20, y: 90 },
  lake: { x: 90, y: 55 },
  cliffs: { x: 8, y: 22 },
  ruins: { x: 84, y: 78 },
};

const ITEMS = {
  weapon: [
    { name: 'Rusty Knife', power: 3, weight: 1 },
    { name: 'Wooden Spear', power: 4, weight: 2 },
    { name: 'Hand Axe', power: 5, weight: 2 },
    { name: 'Hunting Bow', power: 6, weight: 2 },
    { name: 'Serrated Sword', power: 7, weight: 3 },
    { name: 'War Trident', power: 8, weight: 3 },
    { name: 'Throwing Knives (x3)', power: 4, weight: 1 },
    { name: 'Bare-knuckle Brass Grip', power: 2, weight: 1 },
    { name: 'Garrote Wire', power: 3, weight: 1 },
    { name: 'Sickle', power: 4, weight: 1 },
  ],
  tool: [
    { name: 'Coil of Rope', weight: 1 },
    { name: 'Empty Canteen', weight: 1 },
    { name: 'Flint & Steel', weight: 1 },
    { name: 'Camouflage Tarp', weight: 1 },
    { name: 'Backpack', weight: 0 },
    { name: 'Night-Vision Goggles', weight: 1 },
    { name: 'Snare Wire', weight: 1 },
    { name: 'Water Purification Tabs', weight: 1 },
    { name: 'Map Fragment', weight: 0 },
    { name: 'Whetstone', weight: 1 },
  ],
  food: [
    { name: 'Dried Meat Strip', restore: 18 },
    { name: 'Ration Pack', restore: 30 },
    { name: 'Wild Berries', restore: 12 },
    { name: 'Roasted Roots', restore: 15 },
    { name: 'Nut Cache', restore: 14 },
    { name: 'Grain Loaf', restore: 20 },
  ],
  water: [
    { name: 'Water Bottle', restore: 25 },
    { name: 'Purified Water Flask', restore: 35 },
    { name: 'Waterskin', restore: 20 },
  ],
  medicine: [
    { name: 'Bandage', heal: 15 },
    { name: 'Burn Salve', heal: 12 },
    { name: 'Antidote Vial', heal: 20, cures: true },
    { name: 'Painkillers', heal: 10, sanity: 10 },
    { name: 'Suture Kit', heal: 25 },
  ],
};

// Buffs (positive) and debuffs (negative) — mods are additive weights applied
// during the relevant roll. Values are deliberately small; they nudge odds,
// they don't guarantee outcomes.
const TRAITS = [
  { id: 'strong', name: 'Strong', type: 'buff', desc: 'Hits harder in a fight.',
    mods: { combat: 3 } },
  { id: 'fast', name: 'Fast', type: 'buff', desc: 'Good at getting away.',
    mods: { flee: 3 } },
  { id: 'stealthy', name: 'Stealthy', type: 'buff', desc: 'Hard to notice.',
    mods: { stealth: 3, ambush: 2 } },
  { id: 'resourceful', name: 'Resourceful', type: 'buff', desc: 'Finds useful things others miss.',
    mods: { scavenge: 3 } },
  { id: 'charismatic', name: 'Charismatic', type: 'buff', desc: 'People warm to them fast.',
    mods: { alliance: 3, sponsor: 2 } },
  { id: 'medic', name: 'Field Medic', type: 'buff', desc: 'Knows how to patch a wound.',
    mods: { healing: 4 } },
  { id: 'survivalist', name: 'Survivalist', type: 'buff', desc: 'Rarely goes hungry or thirsty.',
    mods: { scavenge: 2, needDecay: -2 } },
  { id: 'lucky', name: 'Lucky', type: 'buff', desc: 'Things tend to go their way.',
    mods: { luck: 4 } },
  { id: 'tracker', name: 'Tracker', type: 'buff', desc: 'Good at finding other tributes.',
    mods: { hunt: 3 } },
  { id: 'steady', name: 'Steady Nerves', type: 'buff', desc: 'Keeps calm under pressure.',
    mods: { sanityDecay: -2 } },
  { id: 'loyal', name: 'Loyal', type: 'buff', desc: 'Sticks by allies, even under pressure.',
    mods: { betrayal: -4 } },

  { id: 'sickly', name: 'Sickly', type: 'debuff', desc: 'Prone to illness and slow to heal.',
    mods: { healthRegen: -2 } },
  { id: 'weak', name: 'Weak', type: 'debuff', desc: 'Struggles in a straight fight.',
    mods: { combat: -3 } },
  { id: 'cowardly', name: 'Cowardly', type: 'debuff', desc: 'Avoids conflict, even when it costs them.',
    mods: { combat: -2, flee: 2 } },
  { id: 'paranoid', name: 'Paranoid', type: 'debuff', desc: 'Trusts no one for long.',
    mods: { alliance: -3, betrayal: 3 } },
  { id: 'reckless', name: 'Reckless', type: 'debuff', desc: 'Takes risks that do not always pay off.',
    mods: { combat: 2, injury: 3 } },
  { id: 'bloodthirsty', name: 'Bloodthirsty', type: 'debuff', desc: 'Quick to turn on anyone, ally or not.',
    mods: { betrayal: 4, ambush: 2 } },
  { id: 'clumsy', name: 'Clumsy', type: 'debuff', desc: 'Accident-prone.',
    mods: { injury: 3, scavenge: -1 } },
  { id: 'insomniac', name: 'Insomniac', type: 'debuff', desc: 'Never sleeps well in the arena.',
    mods: { sanityDecay: 3 } },
  { id: 'unlucky', name: 'Unlucky', type: 'debuff', desc: 'Things rarely go their way.',
    mods: { luck: -4 } },
  { id: 'frail', name: 'Frail', type: 'debuff', desc: 'Needs run down faster than most.',
    mods: { needDecay: 2 } },
];

const FIRST_NAMES = [
  'Aspen','Briar','Cato','Dara','Ember','Fennick','GAlia','Halcyon','Iris','Jarek',
  'Kael','Lyra','Merrin','Nyx','Orin','Petra','Quill','Rue','Soren','Talia',
  'Ursa','Vesper','Wren','Xander','Yara','Zeph','Astra','Bram','Corwin','Delphine',
  'Ezra','Fiora','Garrick','Hazel','Idris','Junia','Kestrel','Linnea','Milo','Nova',
  'Osric','Perrin','Quinta','Roan','Sable','Thane','Una','Vale','Willow','Yorick'
];
const LAST_NAMES = [
  'Ashgrove','Blackwood','Coldwater','Duskwood','Emberfall','Frostbourne','Graystone',
  'Hollowmere','Ironwood','Kestrelwing','Larkspur','Moorland','Nightshade','Oakhart',
  'Pinecrest','Quarrow','Ravensdale','Stormcroft','Thistlewood','Underbrook',
  'Vaneyard','Wolfden','Yewbranch'
];

// Auto-generated alliance name fragments
const ALLIANCE_ADJ = ['Ridge','River','Ember','Ash','Hollow','Ruin','Timber','Storm','Frost','Meadow'];
const ALLIANCE_NOUN = ['Pack','Alliance','Coalition','Watch','Band','Crew','Circle'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickWeighted(entries) {
  // entries: [{item, weight}]
  const total = entries.reduce((s, e) => s + Math.max(0.0001, e.weight), 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0.0001, e.weight);
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomName(usedNames) {
  let name;
  let guard = 0;
  do {
    name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    guard++;
  } while (usedNames && usedNames.has(name) && guard < 50);
  return name;
}
function randomItem(category) {
  const pool = ITEMS[category];
  const base = pick(pool);
  return { ...base, category, id: `${category}_${base.name}_${Math.random().toString(36).slice(2, 8)}`, hidden: false };
}
function randomTraits(count) {
  const shuffled = [...TRAITS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(t => t.id);
}

const HGDataExports = {
  LOCATIONS, LOCATION_COORDS, ITEMS, TRAITS, FIRST_NAMES, LAST_NAMES,
  ALLIANCE_ADJ, ALLIANCE_NOUN, pick, pickWeighted, randInt, randomName,
  randomItem, randomTraits,
};

if (typeof module !== 'undefined') {
  module.exports = HGDataExports;
} else {
  (typeof window !== 'undefined' ? window : self).HGData = HGDataExports;
}
