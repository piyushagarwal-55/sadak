import { discountPct, formatPrice } from '../data/shoes.js'

// ============================================================================
// ShoppingSession — the shared memory every employee reads and writes.
// This is what makes the staff feel "agentic": the greeter, the associate, the
// inventory runner, the trial assistant and the cashier all coordinate through
// one evolving picture of where the customer is in their journey.
// ============================================================================

// Journey stages, in order.
export const STAGE = {
  ENTER: 'enter', // just walked in, nobody has spoken yet
  GREETED: 'greeted', // greeter said hello
  NEED: 'need', // category/usage known, associate summoned
  APPROACHED: 'approached', // associate reached the customer
  SHOWN: 'shown', // associate presented options on the table
  SIZE_REQ: 'size-req', // customer asked for a size
  SIZE_READY: 'size-ready', // inventory brought the box
  TRYING: 'trying', // customer is in the trial room
  TRIED: 'tried', // came back from the trial room
  DECIDED: 'decided', // decided to buy → sent to counter
  PAID: 'paid', // cashier completed payment
  DONE: 'done', // has bag + receipt, leaving
}

export class ShoppingSession {
  constructor() {
    this.reset()
  }

  reset() {
    this.stage = STAGE.ENTER
    this.category = null // e.g. 'Running'
    this.usage = null // e.g. 'daily morning runs'
    this.budget = null
    this.favoriteColor = null
    this.shown = [] // products the associate has presented
    this.selected = null // the product the customer is focused on
    this.selectedSize = null
    this.selectedColor = null // {name,hex}
    this.requestedSize = null // size the customer asked to try
    this.sizeFetched = false // inventory brought it
    this.triedOn = false
    this.fitVerdict = null // outcome of the try-on
    this.order = null // completed order (receipt payload)
    this.receiptGiven = false
    this.bagGiven = false
    this.events = [] // running memory log
    // one-time conversation flags so nobody repeats themselves
    this.met = { greeter: false, associate: false, inventory: false, trial: false, cashier: false }
    this.told = {} // arbitrary "already said X" flags
  }

  log(msg) {
    this.events.push(msg)
    if (this.events.length > 60) this.events.shift()
  }

  once(key) {
    if (this.told[key]) return false
    this.told[key] = true
    return true
  }
  said(key) {
    return !!this.told[key]
  }

  atLeast(stage) {
    const order = Object.values(STAGE)
    return order.indexOf(this.stage) >= order.indexOf(stage)
  }
  advance(stage) {
    const order = Object.values(STAGE)
    if (order.indexOf(stage) > order.indexOf(this.stage)) {
      this.stage = stage
      this.log(`stage → ${stage}`)
    }
  }

  setNeed(category, usage) {
    this.category = category
    this.usage = usage || this.usage
    this.log(`wants ${category}${usage ? ' for ' + usage : ''}`)
    this.advance(STAGE.NEED)
  }

  present(products) {
    this.shown = products
    this.log(`shown: ${products.map((p) => p.name).join(', ')}`)
    this.advance(STAGE.SHOWN)
  }

  focus(product) {
    this.selected = product
    if (!this.selectedColor) this.selectedColor = product.colors?.[0] || null
    this.log(`focused on ${product.name}`)
  }

  // Build the immutable order + receipt once, at payment time.
  // lines: [{ product, size, color, qty }]
  finalizeOrder(lines, { payment, wantBag, cashier }) {
    const rows = lines.map((l) => {
      const p = l.product
      return {
        name: p.name,
        brand: p.brand,
        size: l.size ?? '—',
        color: l.color || p.colors?.[0]?.name || 'Standard',
        qty: l.qty || 1,
        mrp: p.mrp || p.price,
        price: p.price,
        warranty: p.warranty || '6-month warranty',
      }
    })
    const subtotal = rows.reduce((n, r) => n + r.price * r.qty, 0)
    const mrpTotal = rows.reduce((n, r) => n + r.mrp * r.qty, 0)
    const discount = mrpTotal - subtotal
    const gst = Math.round(subtotal * 0.18)
    const total = subtotal + gst
    const main = this.selected
    const now = this._stamp()
    this.order = {
      store: 'POUNCE FOOTWEAR',
      tagline: 'The Sole of the City',
      address: 'Shop 04, Neon Square, POUNCE City — 400001',
      gstin: '27PNCEF1234K1Z9',
      phone: '+91 1800-POUNCE-1',
      support: '+91 1800-287-2348',
      invoice: 'AF-' + now.serial,
      date: now.date,
      time: now.time,
      cashier: cashier || 'Priya',
      rows,
      item: main?.name,
      brand: main?.brand,
      size: this.selectedSize || this.requestedSize || rows[0]?.size,
      color: this.selectedColor?.name || rows[0]?.color,
      qty: rows.reduce((n, r) => n + r.qty, 0),
      mrpTotal,
      subtotal,
      discount,
      discountPct: main ? discountPct(main) : 0,
      gst,
      total,
      payment,
      txn: (payment.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'PAY') + now.txn,
      bag: !!wantBag,
      returnPolicy: '7-day easy return / exchange with tags & receipt.',
      warranty: main?.warranty || '6-month manufacturer warranty against defects.',
    }
    this.advance(STAGE.PAID)
    this.log(`paid ${formatPrice(total)} via ${payment}`)
    return this.order
  }

  // Deterministic-ish timestamp/serial without relying on wall clock at build.
  _stamp() {
    const n = Date.now()
    const d = new Date(n)
    const pad = (x) => String(x).padStart(2, '0')
    return {
      date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      serial: n.toString().slice(-6),
      txn: n.toString(36).toUpperCase().slice(-8),
    }
  }
}
