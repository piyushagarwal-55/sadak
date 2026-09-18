import { STAGE } from '../systems/ShoppingSession.js'
import { Employee } from '../world/Employee.js'
import { bySection, formatPrice, discountPct, floorSizes } from './shoes.js'

// ============================================================================
// The five employees of POUNCE Footwear and their context-aware dialogue.
// Every script(game) reads game.session, so nobody repeats themselves and the
// team coordinates: the greeter hands off to Rahul, Rahul calls Vikram for
// sizes, Nisha minds the fitting room, Priya rings you up.
// ============================================================================

const money = formatPrice
const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) + `  ${r.toFixed(1)}`

// Curated top picks per category (falls back to section listing).
function optionsFor(category) {
  const list = bySection(category)
  return list.slice(0, 3)
}

const CATEGORY_LABELS = {
  Running: 'Running shoes',
  Basketball: 'Basketball shoes',
  'Casual Sneakers': 'Casual sneakers',
  Formal: 'Formal shoes',
  Outdoor: 'Outdoor & hiking',
  Luxury: 'Luxury collection',
}

const USAGE_BY_CATEGORY = {
  Running: ['Daily morning runs', 'Gym workouts', 'Marathon training', 'Casual walking'],
  Basketball: ['Indoor court', 'Outdoor blacktop', 'Streetwear look'],
  'Casual Sneakers': ['Everyday wear', 'Smart-casual', 'Weekend outings'],
  Formal: ['Office', 'A wedding', 'Evening events'],
  Outdoor: ['Hiking & trekking', 'Wet terrain', 'Everyday outdoors'],
  Luxury: ['A statement piece', 'Gifting', 'Smart evening'],
}

// ---------------------------------------------------------------------------
// GREETER — Aisha
// ---------------------------------------------------------------------------
function greeterScript(game) {
  const s = game.session
  s.met.greeter = true
  if (s.atLeast(STAGE.PAID)) {
    return { speaker: 'Aisha', role: 'Store Greeter', lines: [`All done? Wonderful — I hope you love the ${s.selected?.name || 'pair'}! 🛍️`, 'Do come back for the next drop. Take care!'] }
  }
  if (s.category) {
    return {
      speaker: 'Aisha', role: 'Store Greeter',
      lines: [`You're in good hands — Rahul's our ${CATEGORY_LABELS[s.category] || s.category} specialist.`, 'He should be right with you. Shout if you need anything else!'],
    }
  }
  s.advance(STAGE.GREETED)
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return {
    speaker: 'Aisha', role: 'Store Greeter',
    lines: [
      `${part}, and welcome to POUNCE Footwear! 👟`,
      "We've a fresh drop in this week and up to 40% off in the Sale corner.",
      'What can I point you towards today?',
    ],
    choices: [
      ...['Running', 'Basketball', 'Casual Sneakers', 'Formal'].map((cat) => ({
        label: CATEGORY_LABELS[cat],
        say: `I'm looking for ${CATEGORY_LABELS[cat].toLowerCase()}.`,
        do: (g) => {
          g.session.setNeed(cat)
          g.summonAssociate()
        },
        goto: () => ({
          speaker: 'Aisha', role: 'Store Greeter',
          lines: [`Perfect. Rahul handles our ${CATEGORY_LABELS[cat].toLowerCase()} — let me wave him over.`, '*gestures toward the ' + cat + ' wall*'],
        }),
      })),
      {
        label: 'Just browsing',
        say: 'Just browsing for now, thanks.',
        goto: () => ({ speaker: 'Aisha', role: 'Store Greeter', lines: ['Of course — take your time and enjoy the wall.', 'Wave Rahul down whenever you want a hand. 😊'] }),
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// SALES ASSOCIATE — Rahul (the guide)
// ---------------------------------------------------------------------------
function associateScript(game) {
  const s = game.session
  const firstMeet = !s.met.associate
  s.met.associate = true

  // Already bought → wrap up
  if (s.atLeast(STAGE.DECIDED)) {
    if (s.atLeast(STAGE.PAID)) return line('Rahul', 'Sales Associate', [`Enjoy the ${s.selected?.name}! Great pick. 👟`])
    return line('Rahul', 'Sales Associate', [`You're all set — Priya's at the checkout counter with your ${s.selected?.name}.`, "Just walk over when you're ready; she already has it reserved."])
  }

  // Came back from the trial room
  if (s.triedOn && s.stage === STAGE.TRIED) {
    return {
      speaker: 'Rahul', role: 'Sales Associate',
      lines: [`So — how did the ${s.selected?.name} feel?`],
      choices: [
        {
          label: 'Perfect, I\'ll take them', say: 'They\'re perfect — I\'ll take them.',
          do: (g) => { g.session.advance(STAGE.DECIDED); g.sendToCounter() },
          goto: () => line('Rahul', 'Sales Associate', ['Excellent choice! 🎉', "I've reserved this pair — head over to the counter and Priya will ring you up. I'll be right here in the department."]),
        },
        {
          label: 'A bit tight — size up?', say: 'A little tight. Can I try a half-size up?',
          do: (g) => { const nx = (g.session.selectedSize || 9) + 1; g.session.requestedSize = nx; g.fetchSize(g.session.selected, nx) },
          goto: () => line('Rahul', 'Sales Associate', ["No problem at all — Vikram's grabbing the next size from the back.", "Give it a moment and try again in the fitting room."]),
        },
        { label: 'I\'ll think about it', say: 'I\'ll have a think.', goto: () => line('Rahul', 'Sales Associate', ['Absolutely, no rush.', "I'll be around the running wall if you decide."]) },
      ],
    }
  }

  // Size already fetched, waiting for the customer to try
  if (s.sizeFetched && !s.triedOn) {
    return line('Rahul', 'Sales Associate', [`Your ${s.selected?.name} in size ${s.requestedSize} is ready. 👟`, "The fitting room's just there — Nisha will set you up. Take your time, I'll be right outside if you need another size."])
  }

  // No category yet (customer approached Rahul directly)
  if (!s.category) {
    return {
      speaker: 'Rahul', role: 'Sales Associate',
      lines: firstMeet ? ["Hey! I'm Rahul. 👋", 'What are you shopping for today?'] : ['What are you after?'],
      choices: ['Running', 'Basketball', 'Casual Sneakers', 'Formal', 'Outdoor', 'Luxury'].map((cat) => ({
        label: CATEGORY_LABELS[cat], say: `${CATEGORY_LABELS[cat]}, please.`,
        do: (g) => g.session.setNeed(cat),
        goto: (g) => usageNode(g),
      })),
    }
  }

  // Have a category but haven't asked usage yet
  if (!s.usage) {
    if (firstMeet) {
      return {
        speaker: 'Rahul', role: 'Sales Associate',
        lines: [`Hi! I'm Rahul. 👋 Aisha said you're after ${CATEGORY_LABELS[s.category]?.toLowerCase() || s.category}.`, "Let me get you the right pair — what'll you mainly use them for?"],
        choices: usageChoices(s.category),
      }
    }
    return { speaker: 'Rahul', role: 'Sales Associate', lines: ['What will you mainly use them for?'], choices: usageChoices(s.category) }
  }

  // Usage known but not yet shown → present
  if (s.stage === STAGE.NEED || s.stage === STAGE.APPROACHED) {
    return {
      speaker: 'Rahul', role: 'Sales Associate',
      lines: [reccoLine(s), 'Come with me — let me lay a few out for you.'],
      choices: [{ label: 'Lead the way', say: 'Sounds good — lead the way.', do: (g) => g.leadToSection(g.session.category), goto: () => null }],
    }
  }

  // Presented on the table → explain, focus, size
  return shownNode(game)
}

function usageNode(game) {
  return { speaker: 'Rahul', role: 'Sales Associate', lines: ["Great choice. What'll you mainly use them for?"], choices: usageChoices(game.session.category) }
}
function usageChoices(category) {
  const opts = USAGE_BY_CATEGORY[category] || ['Everyday wear', 'Something special']
  return opts.map((u) => ({
    label: u, say: u + '.',
    do: (g) => { g.session.usage = u; g.session.log('usage: ' + u) },
    goto: (g) => ({
      speaker: 'Rahul', role: 'Sales Associate',
      lines: [reccoLine(g.session), 'Come with me — let me lay a few out on the bench.'],
      choices: [{ label: 'Lead the way', say: 'Lead the way.', do: (gg) => gg.leadToSection(gg.session.category), goto: () => null }],
    }),
  }))
}

function reccoLine(s) {
  const u = (s.usage || '').toLowerCase()
  if (s.category === 'Running') {
    if (u.includes('marathon') || u.includes('long')) return "For the distance you're covering, I'd go max-cushion — soft landings that hold up over the miles."
    if (u.includes('gym')) return "For the gym you want something light and responsive rather than a soft trainer."
    return "For daily runs I'd point you to a lightweight cushioned trainer with good energy return."
  }
  if (s.category === 'Basketball') return 'For the court you want ankle lock-in and grippy traction — our high-tops are built for exactly that.'
  if (s.category === 'Formal') return "For that, full-grain leather with a cushioned footbed — smart, and comfortable enough to wear all day."
  if (s.category === 'Outdoor') return "You'll want waterproofing and a lugged sole for grip — our Summit line is made for it."
  if (s.category === 'Luxury') return 'Then let me show you the crown of the wall — hand-finished, the real statement pieces.'
  return "I've got a few that'll be right up your street."
}

// The three-on-the-bench presentation with drill-down + size request.
function shownNode(game) {
  const s = game.session
  const items = s.shown.length ? s.shown : optionsFor(s.category)
  const lines = [`Here are three ${CATEGORY_LABELS[s.category]?.toLowerCase() || ''} I'd stand behind:`]
  items.forEach((p, i) => lines.push(`${i + 1}. The ${p.name} — ${shortPitch(p)} (${money(p.price)}).`))
  lines.push('Have a proper look — pick one up. Which would you like to know more about?')
  return {
    speaker: 'Rahul', role: 'Sales Associate',
    lines,
    choices: [
      ...items.map((p) => ({
        label: `Tell me about the ${p.name}`, say: `Tell me about the ${p.name}.`,
        do: (g) => g.session.focus(p),
        goto: (g) => productNode(g, p, items),
      })),
      { label: 'Which do you recommend?', say: 'Which do you recommend?', goto: (g) => recommendNode(g, items) },
    ],
  }
}

function shortPitch(p) {
  if (p.comfort >= 5) return 'seriously comfortable'
  if (p.section === 'Basketball') return 'built for the court'
  if (p.section === 'Formal') return 'sharp and hard-wearing'
  if (p.section === 'Luxury') return 'a proper statement'
  if (p.section === 'Outdoor') return 'weatherproof and grippy'
  return 'a reliable everyday pair'
}

function recommendNode(game, items) {
  const best = [...items].sort((a, b) => b.rating - a.rating || b.comfort - a.comfort)[0]
  return {
    speaker: 'Rahul', role: 'Sales Associate',
    lines: [`Honestly? The ${best.name}. ${best.reviews.toLocaleString('en-IN')} reviews at ${best.rating.toFixed(1)}★ and a comfort score of ${best.comfort}/5.`, `${best.desc}`],
    choices: [
      { label: `Try the ${best.name}`, say: `Let's go with the ${best.name}.`, do: (g) => g.session.focus(best), goto: (g) => productNode(g, best, items) },
      { label: 'Show me the others again', say: 'What about the others?', goto: (g) => shownNode(g) },
    ],
  }
}

function productNode(game, p, items) {
  const specs = [
    `Material: ${p.material}`,
    `Comfort: ${'●'.repeat(p.comfort)}${'○'.repeat(5 - p.comfort)} (${p.comfort}/5)`,
    `Best for: ${p.usage}`,
    `Weight: ${p.weight || '—'} · ${stars(p.rating)}`,
    `Warranty: ${p.warranty}`,
  ]
  const onFloor = floorSizes(p)
  return {
    speaker: 'Rahul', role: 'Sales Associate',
    lines: [`Great pair, the ${p.name}.`, ...specs, `On the shelf right now: sizes ${onFloor.join(', ') || '—'}. I can fetch anything else from the back.`],
    choices: [
      { label: 'Try it in my size', say: 'Can I try these on?', goto: (g) => sizeNode(g, p) },
      { label: 'Compare with the others', say: 'How does it compare?', goto: (g) => compareNode(g, p, items) },
      { label: 'Any discount?', say: 'Is there any offer on these?', goto: () => line('Rahul', 'Sales Associate', discountPct(p) > 0 ? [`You're in luck — ${discountPct(p)}% off. That's ${money(p.mrp)} down to ${money(p.price)}.`] : [`No active offer on this one, but at ${money(p.price)} it's honestly well priced for what it is.`]) },
      { label: 'Back to the three', say: 'Let me see all three again.', goto: (g) => shownNode(g) },
    ],
  }
}

function compareNode(game, p, items) {
  const others = items.filter((x) => x.id !== p.id)
  const lines = [`Sure — next to the ${p.name}:`]
  others.forEach((o) => {
    const cmp = o.price < p.price ? 'lighter on the wallet' : o.price > p.price ? 'a step up in price' : 'similar money'
    const c = o.comfort > p.comfort ? 'a touch comfier' : o.comfort < p.comfort ? 'a bit firmer' : 'about as comfy'
    lines.push(`• ${o.name}: ${cmp}, ${c}, ${o.rating.toFixed(1)}★.`)
  })
  return {
    speaker: 'Rahul', role: 'Sales Associate', lines,
    choices: [
      { label: `Stick with the ${p.name}`, say: `I'll stick with the ${p.name}.`, goto: (g) => productNode(g, p, items) },
      ...others.map((o) => ({ label: `Switch to the ${o.name}`, say: `Actually, the ${o.name}.`, do: (g) => g.session.focus(o), goto: (g) => productNode(g, o, items) })),
    ],
  }
}

function sizeNode(game, p) {
  const s = game.session
  s.focus(p)
  return {
    speaker: 'Rahul', role: 'Sales Associate',
    lines: ['Of course — what size are you?'],
    choices: [7, 8, 9, 10, 11].map((sz) => ({
      label: `UK ${sz}`, say: `Size ${sz}, please.`,
      do: (g) => { g.session.requestedSize = sz; g.session.advance(STAGE.SIZE_REQ); g.fetchSize(p, sz) },
      goto: (g) => fetchNode(g, p, sz),
    })),
  }
}

function fetchNode(game, p, sz) {
  const onFloor = floorSizes(p).includes(sz)
  if (onFloor) {
    return line('Rahul', 'Sales Associate', [`Size ${sz} — we've got that right here.`, "I'll grab the box. The fitting room's just there whenever you're ready."])
  }
  return line('Rahul', 'Sales Associate', [`Size ${sz}… not on the shelf, but we'll have it in the back.`, '*calls over his shoulder* — Vikram! Size ' + sz + ' ' + p.name + ', please!', "He's on it — give him a moment and it'll be at the fitting room."])
}

// ---------------------------------------------------------------------------
// INVENTORY — Vikram (the runner)
// ---------------------------------------------------------------------------
function inventoryScript(game) {
  const s = game.session
  if (s.stage === STAGE.SIZE_REQ && !s.sizeFetched) {
    return line('Vikram', 'Inventory', ['On it — grabbing your size from the stockroom now. 🏃', "It'll be at the fitting room in a sec."])
  }
  return {
    speaker: 'Vikram', role: 'Inventory',
    lines: ['I keep the wall stocked and run sizes up from the back.', 'Anything you like but not in your size, just tell Rahul — I\'ll fetch it.'],
  }
}

// ---------------------------------------------------------------------------
// TRIAL ROOM ASSISTANT — Nisha
// ---------------------------------------------------------------------------
function trialScript(game) {
  const s = game.session
  s.met.trial = true
  if (s.triedOn) {
    return { speaker: 'Nisha', role: 'Trial Room Assistant', lines: ['How was the fit? 😊', 'If the size felt off, Rahul can get you another in a snap.'] }
  }
  if (s.sizeFetched && s.selected) {
    return {
      speaker: 'Nisha', role: 'Trial Room Assistant',
      lines: [`Here you go — a fresh pair of disposable socks. 🧦`, `Your ${s.selected.name} in size ${s.requestedSize} is inside.`, 'Step in and press E — the smart mirror does a full virtual try-on: every angle, fit and comfort read-out.'],
      choices: [
        { label: 'How does the try-on work?', say: 'How does the virtual try-on work?', goto: () => line('Nisha', 'Trial Room Assistant', ['The mirror scans the pair onto you and rotates through front, side and back — even a walking view.', 'It reads your fit and comfort and suggests a size if needed. Give it a go!']) },
        { label: 'Thanks', say: 'Thanks, Nisha.', goto: () => line('Nisha', 'Trial Room Assistant', ["I'll be right outside — call me if you need another size. 🙂"]) },
      ],
    }
  }
  return { speaker: 'Nisha', role: 'Trial Room Assistant', lines: ['Trying something on? Pick a pair with Rahul and I\'ll set you up with socks and the smart mirror. 👟'] }
}

// ---------------------------------------------------------------------------
// CASHIER — Priya
// ---------------------------------------------------------------------------
function cashierScript(game) {
  const s = game.session
  s.met.cashier = true

  if (s.atLeast(STAGE.PAID)) {
    // Handle "can I have my receipt?" memory
    return {
      speaker: 'Priya', role: 'Cashier',
      lines: [s.bagGiven ? `Here's your bag 🛍️ — the ${s.selected?.name} are packed and ready.` : 'All done! Let me pack that up for you.'],
      choices: [
        {
          label: 'Can I have my receipt?', say: 'Can I have my receipt?',
          goto: (g) => g.session.receiptGiven
            ? line('Priya', 'Cashier', ["I've already tucked it inside your shopping bag. 🙂", 'Anything else I can help with?'])
            : receiptGiveNode(g),
        },
        { label: "That's everything, thanks", say: "That's everything — thank you!", goto: () => line('Priya', 'Cashier', ['Thank you for shopping at POUNCE Footwear! 👋', 'Enjoy them — and mind the puddles out on Neon Square.']) },
      ],
    }
  }

  if (s.atLeast(STAGE.DECIDED) && s.selected) {
    const p = s.selected
    return {
      speaker: 'Priya', role: 'Cashier',
      lines: [`Hello! Rahul reserved these for you 😊`, `The ${p.name}, size ${s.requestedSize || s.selectedSize || 9}, in ${s.selectedColor?.name || p.colors?.[0]?.name}.`, `That's ${money(p.price)}. Shall I ring it up?`],
      choices: [
        { label: 'Yes, check me out', say: 'Yes please.', do: (g) => g.ui.openCheckout(true), goto: () => null },
        { label: 'One moment', say: 'Give me one moment.', goto: () => line('Priya', 'Cashier', ["Take your time — I'll hold it right here."]) },
      ],
    }
  }

  return { speaker: 'Priya', role: 'Cashier', lines: ['Hi there! Found everything okay?', 'When you\'ve picked your pair, bring it over and I\'ll get you sorted. 💳'] }
}

function receiptGiveNode(game) {
  return {
    speaker: 'Priya', role: 'Cashier',
    lines: ['Certainly — here\'s your receipt. 🧾'],
    choices: [{ label: 'Take receipt', say: null, do: (g) => g.ui.showReceipt(), goto: () => null }],
  }
}

// small helper
function line(speaker, role, lines) {
  return { speaker, role, lines }
}

// ---------------------------------------------------------------------------
// Build all five, positioned by the world.
// ctx: { greeter, associate, inventory, trial, cashier } each {x,z,heading}
// ---------------------------------------------------------------------------
export function buildStaff(ctx) {
  const greeter = new Employee({
    name: 'Aisha', role: 'greeter', pos: ctx.greeter, heading: ctx.greeter.heading,
    palette: { shirt: '#0f172a', pants: '#1e293b', hair: '#3b2a20', accent: '#f43f5e' },
    home: ctx.greeter, script: greeterScript, idle: 'stand',
  })
  const associate = new Employee({
    name: 'Rahul', role: 'associate', pos: ctx.associate, heading: ctx.associate.heading,
    palette: { shirt: '#e11d48', pants: '#0f172a', hair: '#111827', accent: '#111827' },
    home: ctx.associate, script: associateScript, idle: 'restock',
  })
  const inventory = new Employee({
    name: 'Vikram', role: 'inventory', pos: ctx.inventory, heading: ctx.inventory.heading,
    palette: { shirt: '#0891b2', pants: '#0f172a', hair: '#1c1917', accent: '#f59e0b' },
    home: ctx.inventory, script: inventoryScript, idle: 'restock',
  })
  const trial = new Employee({
    name: 'Nisha', role: 'trial', pos: ctx.trial, heading: ctx.trial.heading,
    palette: { shirt: '#7c3aed', pants: '#1e1b4b', hair: '#0f172a', accent: '#c4b5fd' },
    home: ctx.trial, script: trialScript, idle: 'stand',
  })
  const cashier = new Employee({
    name: 'Priya', role: 'cashier', pos: ctx.cashier, heading: ctx.cashier.heading,
    palette: { shirt: '#111827', pants: '#0b1120', hair: '#1c1917', accent: '#f43f5e' },
    home: ctx.cashier, script: cashierScript, idle: 'stand',
  })
  return { greeter, associate, inventory, trial, cashier, all: [greeter, associate, inventory, trial, cashier] }
}
