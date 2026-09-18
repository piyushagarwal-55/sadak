// Character archetypes — the data that makes a crowd read as people rather than
// recoloured clones. Each archetype sets body proportions, hair, clothing cut
// and accessories; Avatar.js builds geometry from these numbers.
//
// Proportions are multipliers against the base adult rig:
//   height     overall scale
//   headScale  head size relative to body (children are famously top-heavy)
//   shoulders  shoulder width
//   hips       hip width
//   belly      torso depth
//   stoop      forward lean of the upper body, in radians
//   pace       walk speed multiplier
//   bounce     vertical bob while walking

export const ARCHETYPES = {
  child: {
    label: 'child',
    height: 0.60, headScale: 1.34, shoulders: 0.82, hips: 0.86, belly: 0.92,
    stoop: 0, pace: 1.25, bounce: 1.7, limbThick: 0.86,
    hair: ['mop', 'bob', 'short'], outfit: 'shorts', ageTone: 'young',
  },
  girl: {
    label: 'girl',
    height: 0.74, headScale: 1.18, shoulders: 0.86, hips: 0.98, belly: 0.9,
    stoop: 0, pace: 1.15, bounce: 1.4, limbThick: 0.88,
    hair: ['ponytail', 'braid', 'bob'], outfit: 'skirt', ageTone: 'young',
  },
  boy: {
    label: 'boy',
    height: 0.78, headScale: 1.16, shoulders: 0.94, hips: 0.9, belly: 0.92,
    stoop: 0, pace: 1.2, bounce: 1.5, limbThick: 0.9,
    hair: ['mop', 'short', 'spike'], outfit: 'shorts', ageTone: 'young',
  },
  woman: {
    label: 'woman',
    height: 0.96, headScale: 1.0, shoulders: 0.94, hips: 1.1, belly: 0.94,
    stoop: 0, pace: 1.0, bounce: 1.0, limbThick: 0.94,
    hair: ['bun', 'long', 'ponytail', 'bob'], outfit: 'dress', ageTone: 'adult',
  },
  man: {
    label: 'man',
    height: 1.03, headScale: 0.98, shoulders: 1.14, hips: 0.98, belly: 1.0,
    stoop: 0, pace: 1.0, bounce: 1.0, limbThick: 1.05,
    hair: ['short', 'spike', 'fade'], outfit: 'pants', ageTone: 'adult',
    facial: ['none', 'stubble', 'beard'],
  },
  aunty: {
    label: 'aunty',
    height: 0.93, headScale: 1.03, shoulders: 1.0, hips: 1.22, belly: 1.2,
    stoop: 0.04, pace: 0.82, bounce: 0.8, limbThick: 1.08,
    hair: ['bun', 'long'], outfit: 'saree', ageTone: 'mid',
    accessories: ['bag'],
  },
  uncle: {
    label: 'uncle',
    height: 0.99, headScale: 1.0, shoulders: 1.12, hips: 1.04, belly: 1.34,
    stoop: 0.06, pace: 0.85, bounce: 0.8, limbThick: 1.1,
    hair: ['balding', 'short'], outfit: 'shirt-tuck', ageTone: 'mid',
    facial: ['moustache', 'stubble'],
  },
  grandma: {
    label: 'grandma',
    height: 0.84, headScale: 1.06, shoulders: 0.94, hips: 1.14, belly: 1.1,
    stoop: 0.17, pace: 0.6, bounce: 0.5, limbThick: 0.98,
    hair: ['bun-grey'], outfit: 'saree', ageTone: 'old',
    accessories: ['cane', 'glasses'],
  },
  grandpa: {
    label: 'grandpa',
    height: 0.89, headScale: 1.04, shoulders: 1.04, hips: 1.0, belly: 1.16,
    stoop: 0.2, pace: 0.58, bounce: 0.5, limbThick: 1.0,
    hair: ['balding-grey', 'grey'], outfit: 'shirt-tuck', ageTone: 'old',
    facial: ['beard-grey', 'moustache-grey'], accessories: ['cane', 'glasses'],
  },
}

export const SKIN_TONES = ['#F3D3B5', '#EAC393', '#D9A87C', '#C08A5E', '#9C6B45', '#7A4F33', '#5C3A24']

export const HAIR_COLORS = {
  young: ['#2B1B12', '#4A2F1D', '#1F2937', '#6B3F2A', '#0F172A'],
  adult: ['#2B1B12', '#1F2937', '#4A2F1D', '#0F172A', '#5C3317'],
  mid: ['#2B1B12', '#3A3A3A', '#1F2937', '#4A3B33'],
  old: ['#C9C6C2', '#E3E1DE', '#9A9691', '#B5B1AC'],
}

// Wardrobe palettes, kept warm and slightly desaturated so a crowd reads as a
// crowd rather than a bag of highlighter pens.
export const CLOTH = {
  bright: ['#E4572E', '#F2A65A', '#5B8E7D', '#3D5A80', '#8E7DBE', '#C1436D', '#2A9D8F', '#E9C46A'],
  muted: ['#6B705C', '#A5A58D', '#7F5539', '#43503F', '#586F7C', '#8D6A9F', '#9C6644'],
  saree: ['#C1436D', '#E76F51', '#2A9D8F', '#8E44AD', '#D4A017', '#1B6CA8', '#B5179E'],
  bottoms: ['#243244', '#3E3E42', '#4A3728', '#2F4550', '#5C5470', '#374151'],
}

const NAMES = {
  child: ['Aarav', 'Ishita', 'Vivaan', 'Anaya', 'Reyansh', 'Myra', 'Kabir', 'Sara'],
  girl: ['Diya', 'Ananya', 'Kiara', 'Aisha', 'Tara', 'Nisha', 'Riya'],
  boy: ['Arjun', 'Rohan', 'Dev', 'Yash', 'Aryan', 'Karan', 'Veer'],
  woman: ['Meera', 'Priya', 'Naina', 'Sofia', 'Lena', 'Divya', 'Aditi', 'Zara'],
  man: ['Rahul', 'Vikram', 'Nikhil', 'Sameer', 'Jay', 'Aditya', 'Farhan'],
  aunty: ['Sunita', 'Rekha', 'Kamala', 'Shobha', 'Usha', 'Lakshmi'],
  uncle: ['Rajesh', 'Suresh', 'Mahesh', 'Prakash', 'Anil', 'Dinesh'],
  grandma: ['Dadi', 'Nani', 'Savitri', 'Kaushalya', 'Parvati'],
  grandpa: ['Dada', 'Nana', 'Ramesh', 'Gopal', 'Hari'],
}

// Deterministic pick so a seeded world regenerates identically.
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length]

export function makePerson(kind, rng) {
  const a = ARCHETYPES[kind]
  const r = () => rng()
  return {
    kind,
    name: pick(NAMES[kind] ?? NAMES.man, r()),
    skin: pick(SKIN_TONES, r()),
    hairStyle: pick(a.hair, r()),
    hairColor: pick(HAIR_COLORS[a.ageTone], r()),
    outfit: a.outfit,
    top: pick(a.ageTone === 'old' || a.ageTone === 'mid' ? CLOTH.muted : CLOTH.bright, r()),
    saree: pick(CLOTH.saree, r()),
    bottom: pick(CLOTH.bottoms, r()),
    facial: a.facial ? pick(a.facial, r()) : 'none',
    accessories: a.accessories ?? [],
    archetype: a,
  }
}

// A believable street mix — weighted so adults dominate and elders are rarer.
export const CROWD_MIX = [
  ['man', 0.2], ['woman', 0.2], ['boy', 0.1], ['girl', 0.1],
  ['child', 0.12], ['uncle', 0.1], ['aunty', 0.1], ['grandpa', 0.04], ['grandma', 0.04],
]

export function pickKind(rng) {
  let t = rng()
  for (const [kind, w] of CROWD_MIX) {
    t -= w
    if (t <= 0) return kind
  }
  return 'man'
}
