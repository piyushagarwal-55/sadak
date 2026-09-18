import * as THREE from 'three'
import { makeCanvasTexture } from '../core/util.js'

// Social gives the crowd a voice. Left alone the plaza NPCs walk past each other
// in silence, which reads as "23 pedestrians on rails" rather than a square full
// of people. This system periodically catches two wanderers who happen to be
// standing near each other, stops them, turns them face to face and runs a short
// scripted exchange in speech bubbles.
//
// It deliberately owns nothing permanent: it borrows NPCs for a few seconds and
// hands them straight back to their own wander AI. See the ownership notes on
// Social._claim / Social._release — sharing `npc.paused` with the player
// dialogue is the whole design problem here.

// ---------------------------------------------------------------------------
// Small talk. Each entry is one exchange, spoken alternately starting with the
// NPC that was picked first. Keep every line under ~36 characters: the bubble
// wraps at 20 and shows at most two lines, and anything longer gets clipped.
// ---------------------------------------------------------------------------
const EXCHANGES = [
  ['Those trainers in SOLE are unreal.', 'The queue was around the block.'],
  ['Volt has the new headphones in.', "At that price? I'll just look.", 'Looking is free. Mostly.'],
  ['Bloom does a decent flat white.', 'Best cup in the district.'],
  ["The fountain's louder tonight.", 'They turned the jets up for summer.'],
  ['Rain later, they reckon.', 'Not with a sky like that.', 'The sky lies.', 'Bring a coat then.'],
  ["POUNCE's window changed again.", 'Third time this month.', "Someone's got a budget."],
  ['Those kids will break a window.', "That ball's been close twice.", "I'd move if I were you."],
  ['Square is packed for a Tuesday.', "Payday. It's always payday."],
  ['That billboard is far too bright.', 'You get used to it.', "I really don't."],
  ['Twelve for a coffee. Twelve.', "You're paying for the seats."],
  ['Did you see the queue at Volt?', 'New drop at six, apparently.'],
  ['My feet are finished.', 'One more shop.', 'You said that two shops ago.'],
  ['Neon looks better after dark.', 'Everything does, round here.'],
  ['Meeting Sam by the fountain.', "They're always late.", 'Always.'],
]

const WRAP = 20 // characters per bubble line
const MAX_LINES = 2
const PX = 0.0026 // canvas pixels -> world units for the bubble sprite
const TEX_CACHE_MAX = 16

function wrap(text) {
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > WRAP && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES
    lines[MAX_LINES - 1] = lines[MAX_LINES - 1].slice(0, WRAP - 1) + '…'
  }
  return lines
}

// A rounded panel with a little tail, drawn once per distinct line and cached.
function bubbleTexture(text) {
  const lines = wrap(text)
  const font = 38
  const lineH = 46
  const padX = 30
  const padY = 24
  const tail = 22

  const measure = document.createElement('canvas').getContext('2d')
  measure.font = `600 ${font}px ui-sans-serif, system-ui`
  let tw = 0
  for (const l of lines) tw = Math.max(tw, Math.ceil(measure.measureText(l).width))

  const w = tw + padX * 2
  const bodyH = lines.length * lineH + padY * 2
  const h = bodyH + tail

  return makeCanvasTexture(w, h, (ctx) => {
    const r = 26
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.arcTo(w, 0, w, bodyH, r)
    ctx.arcTo(w, bodyH, 0, bodyH, r)
    // tail, poking down out of the bottom edge toward the speaker's head
    ctx.lineTo(w / 2 + 16, bodyH)
    ctx.lineTo(w / 2 - 2, h)
    ctx.lineTo(w / 2 - 14, bodyH)
    ctx.arcTo(0, bodyH, 0, 0, r)
    ctx.arcTo(0, 0, w, 0, r)
    ctx.closePath()
    ctx.fillStyle = 'rgba(246,248,252,0.96)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(16,23,37,0.28)'
    ctx.stroke()

    ctx.font = `600 ${font}px ui-sans-serif, system-ui`
    ctx.fillStyle = '#101725'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => ctx.fillText(l, w / 2, padY + lineH * (i + 0.5)))
  })
}

export class Social {
  constructor({ npcs = [], rng = Math.random, maxPairs = 3, chatRadius = 3.2 } = {}) {
    this.npcs = npcs
    this.rng = rng
    this.maxPairs = maxPairs
    this.chatRadius = chatRadius

    this.convs = []
    this.time = 0
    this.scanTimer = 1.5

    // NPCs this system paused, and only those. Nothing outside this set is ever
    // un-paused by Social.
    this.owned = new Set()
    // npc -> world time at which it may be pulled into another chat
    this.readyAt = new Map()

    this.group = new THREE.Group()
    this.group.name = 'social-bubbles'
    this.bubbles = [] // pooled sprites, one per conversation slot
    this.texCache = new Map() // line text -> CanvasTexture (LRU)

    this._free = [] // scratch list, reused so scanning allocates nothing
  }

  addTo(world) {
    this.world = world
    this.game = world.game ?? null
    world.scene.add(this.group)
    world.social = this
    return this
  }

  // -------------------------------------------------------------------------
  // Ownership.
  //
  // `npc.paused` is the existing "stand still, someone else is driving" flag —
  // UI.openDialogue sets it and UI.close clears it. Social reuses it rather than
  // inventing a second flag, because NPC.update and every Activity already
  // respect exactly this one; a parallel mechanism would need those files to
  // learn about it and would drift out of sync.
  //
  // The catch is that a bare boolean says "somebody paused this NPC", not who.
  // If the player walks up mid-chat, the game sets the same flag and opens its
  // dialogue panel — and if Social later cleared it, the NPC would wander off
  // mid-sentence with the panel still open. So:
  //   * we only ever claim an NPC whose `paused` is currently false (never steal
  //     one the player has), and record it in `owned`;
  //   * we only ever clear `paused` for an NPC still in `owned`;
  //   * before clearing we re-check that the player hasn't claimed it since, and
  //     if it has, we drop ownership silently and let the UI clear the flag on
  //     close, as it always does.
  // -------------------------------------------------------------------------
  _playerHas(npc) {
    const cur = this.game?.ui?.current
    return !!cur && cur.name === 'dialogue' && cur.npc === npc
  }

  _claim(npc) {
    npc.paused = true
    this.owned.add(npc)
  }

  _release(npc) {
    if (this.owned.has(npc)) {
      this.owned.delete(npc)
      // Only un-pause a pause we set, and only if nobody has taken over since.
      if (!this._playerHas(npc) && npc.paused) npc.paused = false
    }
    this.readyAt.set(npc, this.time + 9 + this.rng() * 9)
  }

  _available(npc) {
    // `controlled` NPCs belong to an Activity (seated, ball game) which owns
    // their position and animation — pulling them into a chat would fight it.
    if (npc.controlled || npc.paused || !npc.area) return false
    if (this.owned.has(npc)) return false
    if ((this.readyAt.get(npc) ?? 0) > this.time) return false
    // group.visible is BaseWorld's distance cull: no point staging a scene for
    // people the player can't see.
    return npc.group.visible
  }

  _scan() {
    if (this.convs.length >= this.maxPairs) return
    const free = this._free
    free.length = 0
    for (const n of this.npcs) if (this._available(n)) free.push(n)
    if (free.length < 2) return

    // Random start offset so it isn't always the same two NPCs at the head of
    // the list striking up a conversation.
    const off = Math.floor(this.rng() * free.length)
    const r2 = this.chatRadius * this.chatRadius
    for (let i = 0; i < free.length; i++) {
      const a = free[(i + off) % free.length]
      for (let j = i + 1; j < free.length; j++) {
        const b = free[(j + off) % free.length]
        const dx = a.group.position.x - b.group.position.x
        const dz = a.group.position.z - b.group.position.z
        if (dx * dx + dz * dz <= r2) {
          this._start(a, b)
          return // one new conversation per scan keeps the square from stalling
        }
      }
    }
  }

  _start(a, b) {
    this._claim(a)
    this._claim(b)
    a.faceToward(b.group.position.x, b.group.position.z)
    b.faceToward(a.group.position.x, a.group.position.z)

    const script = EXCHANGES[Math.floor(this.rng() * EXCHANGES.length)]
    const conv = { a, b, script, idx: -1, timer: 0, slot: this._takeSlot(), age: 0 }
    this.convs.push(conv)
    this._advance(conv)
  }

  _takeSlot() {
    const used = new Set(this.convs.map((c) => c.slot))
    for (let i = 0; i < this.maxPairs; i++) if (!used.has(i)) return i
    return 0
  }

  // One sprite per conversation slot, not per speaker — only one of the pair is
  // talking at a time, so the bubble simply hops to whoever has the line.
  _bubble(slot) {
    let sp = this.bubbles[slot]
    if (!sp) {
      sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }))
      // Same trick as the name tags: bubbles must read through lampposts, market
      // stalls and other people, otherwise half the crowd's dialogue is hidden
      // behind whatever the speaker is standing next to.
      sp.renderOrder = 51
      sp.visible = false
      this.group.add(sp)
      this.bubbles[slot] = sp
    }
    return sp
  }

  _texture(text) {
    let tex = this.texCache.get(text)
    if (tex) {
      // refresh LRU position
      this.texCache.delete(text)
      this.texCache.set(text, tex)
      return tex
    }
    tex = bubbleTexture(text)
    this.texCache.set(text, tex)
    if (this.texCache.size > TEX_CACHE_MAX) {
      // Evict oldest, but never a line currently on screen — its sprite still
      // points at that map.
      const live = new Set(this.convs.map((c) => c.text))
      for (const [k, v] of this.texCache) {
        if (live.has(k)) continue
        this.texCache.delete(k)
        v.dispose()
        break
      }
    }
    return tex
  }

  _advance(conv) {
    conv.idx++
    if (conv.idx >= conv.script.length) {
      this._end(conv)
      return
    }
    const speaker = conv.idx % 2 === 0 ? conv.a : conv.b
    const text = conv.script[conv.idx]
    conv.speaker = speaker
    conv.text = text
    conv.timer = 2.2 + this.rng() * 0.8
    conv.age = 0

    const sp = this._bubble(conv.slot)
    const tex = this._texture(text)
    sp.material.map = tex
    sp.material.needsUpdate = true
    conv.w = tex.image.width * PX
    conv.h = tex.image.height * PX
    sp.visible = true
  }

  _end(conv) {
    const sp = this.bubbles[conv.slot]
    if (sp) {
      sp.visible = false
      // the map itself lives in the cache and is disposed on eviction / dispose()
      sp.material.map = null
    }
    this._release(conv.a)
    this._release(conv.b)
    conv.text = null
    const i = this.convs.indexOf(conv)
    if (i >= 0) this.convs.splice(i, 1)
  }

  // A participant is lost if the player has claimed it (dialogue panel open), if
  // an Activity took it over, or if its pause was cleared by someone else —
  // UI.close() clears the flag unconditionally, so an NPC we still think we own
  // can come back un-paused and start walking mid-sentence.
  _lost(npc) {
    return npc.controlled || this._playerHas(npc) || !npc.paused
  }

  update(dt) {
    dt = Math.min(dt, 0.1)
    this.time += dt

    this.scanTimer -= dt
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.9
      this._scan()
    }

    for (let i = this.convs.length - 1; i >= 0; i--) {
      const conv = this.convs[i]

      if (this._lost(conv.a) || this._lost(conv.b)) {
        this._end(conv) // _release does the right thing for a stolen NPC
        continue
      }

      conv.timer -= dt
      conv.age += dt
      if (conv.timer <= 0) {
        this._advance(conv)
        continue
      }

      const sp = this.bubbles[conv.slot]
      const s = conv.speaker
      // Hide rather than end when the speaker is culled — the pair carries on
      // and the player just doesn't hear it from across the plaza.
      sp.visible = s.group.visible
      if (!sp.visible) continue

      const p = s.group.position
      // Name tags sit at ~2.6 (scaled per archetype); park the bubble above one.
      sp.position.set(p.x, s.avatar.nameTag.position.y + 0.55, p.z)
      // small pop as the line appears
      const t = Math.min(1, conv.age / 0.14)
      const k = t * t * (3 - 2 * t)
      sp.scale.set(conv.w * k, conv.h * k, 1)
    }
  }

  dispose() {
    for (const conv of [...this.convs]) this._end(conv)
    for (const tex of this.texCache.values()) tex.dispose()
    this.texCache.clear()
    for (const sp of this.bubbles) {
      sp.material.dispose()
      this.group.remove(sp)
    }
    this.bubbles.length = 0
    this.group.parent?.remove(this.group)
  }
}
