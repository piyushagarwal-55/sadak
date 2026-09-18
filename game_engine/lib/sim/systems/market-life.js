import * as THREE from 'three'
import { makePerson, setWalkPhase, setIdlePhase } from '@/lib/game/people'
import { makeProxyBody, setProxyFrame, disposeProxy } from '../kit/proxy-body'
import { mulberry32 } from '@/lib/game/props'

/**
 * MARKET LIFE.
 *
 * A market is not a crowd of pedestrians. It is shopkeepers behind their goods
 * waiting to be asked, customers who came WITH someone, children who will not
 * stay with them, and a porter shoving through the middle of it with a sack on
 * his head. Those behaviours, at the right proportions, are the difference
 * between a set and a place — and none of them needs a language model.
 *
 * WHO IS HERE
 *
 *   keeper    one behind every stall, turned to face the gali, reaching for
 *             goods every few seconds. These are the people you will talk to.
 *   shopper   walks to a stall, looks at it for a few seconds, moves on. A
 *             third of them are in pairs, walking and stopping together.
 *   child     two thirds the size, runs rather than walks, lags behind the
 *             adult it belongs to and then sprints to catch up.
 *   porter    walks the full length of the gali and back with a load, never
 *             stopping, which is what gives the lane a current.
 *   poser     a pair frozen mid-haggle and a knot of men at the chai tapri. A
 *             market where everybody is walking looks like an airport.
 *
 * WHAT IT COSTS, AND THE TRICK THAT PAYS FOR IT
 *
 * A `makePerson` rig is fourteen meshes, so thirty people is four hundred and
 * seventy draw calls — more than the demo laptop's Intel UHD has for the entire
 * world. So every body is built twice: the articulated rig, and a one-mesh
 * baked proxy (see `kit/proxy-body`). Inside `RIG` metres you get the rig and
 * the real gait; beyond it you get the proxy, which is a single draw call and
 * flips between two stride poses. Past `CULL` there is nothing at all.
 *
 * That is what lets the gali hold thirty-odd people instead of a dozen: only
 * the handful you could actually look at are paid for in full.
 */

/** Nothing is drawn past this. A gali has short sightlines; 46 m is generous. */
const CULL = 46
/**
 * Inside this, the articulated rig. Outside, the one-mesh proxy.
 *
 * Measured in the gali at full density: at 17 m the near band held twenty-odd
 * rigs and the frame cost 728 draw calls. At 13 m it holds the people you could
 * actually walk up to and talk to, the gait is still legible on all of them,
 * and the rest of the street is a single call each.
 */
const RIG = 13
/** Bubbles only from people close enough to read one. */
const TALK = 15

/** Metres per second. A market shuffles; children do not. */
const PACE = { shopper: [0.7, 1.15], child: [1.5, 2.1], porter: [1.15, 1.35] }

const PRESETS = ['sari', 'salwar_kameez', 'kurta_pyjama', 'shirt_trousers', 'lungi']

/**
 * Who comes to a market with whom, as followers behind one leader.
 *
 * Roughly a third alone, a third as a pair, a third with children — and the one
 * big family, because every market has one and it is the group a player
 * actually notices.
 */
const GROUPS = [
  [],
  ['adult'],
  ['child'],
  [],
  ['adult', 'child'],
  ['child'],
  ['adult'],
  ['adult', 'child', 'child'],
]

/* ------------------------------------------------------------------ *
 * Ambient talk
 * ------------------------------------------------------------------ */

/**
 * What the market says to itself.
 *
 * Hand-written per language rather than generated: these are background lines
 * nobody will answer, the model's tokens belong in the conversation the player
 * is actually having, and a wrong-script bubble over a stranger's head is a bug
 * a judge would spot from across the room.
 */
export const AMBIENT_LINES = {
  'te-IN': {
    keeper: ['రండి రండి!', 'తాజాగా ఉంది', 'ఒక కిలో?', 'చూడండి సార్'],
    shopper: ['ఎంత?', 'కొంచెం తగ్గించండి', 'సరే, ఇవ్వండి', 'బాగుంది'],
  },
  'hi-IN': {
    keeper: ['आइए भाईसाहब!', 'एकदम ताज़ा', 'कितना दूँ?', 'देख लीजिए'],
    shopper: ['कितने का?', 'थोड़ा कम करो', 'एक किलो देना', 'ठीक है'],
  },
  'ta-IN': {
    keeper: ['வாங்க சார்!', 'புதுசு', 'எவ்வளவு வேணும்?', 'பாருங்க'],
    shopper: ['எவ்வளவு?', 'கொஞ்சம் குறைங்க', 'ஒரு கிலோ', 'சரி'],
  },
}

const BUBBLE_FONT = {
  Telugu: '"Noto Sans Telugu"',
  Devanagari: '"Noto Sans Devanagari"',
  Tamil: '"Noto Sans Tamil"',
  Bengali: '"Noto Sans Bengali"',
  Kannada: '"Noto Sans Kannada"',
  Malayalam: '"Noto Sans Malayalam"',
  Gujarati: '"Noto Sans Gujarati"',
  Gurmukhi: '"Noto Sans Gurmukhi"',
  Odia: '"Noto Sans Oriya"',
}

const bubbleCache = new Map()

/**
 * A speech bubble as a sprite.
 *
 * Sprites rather than world-space planes so they always face the camera and are
 * never edge-on and unreadable, and the material is cached by text so ten
 * people saying the same line cost one texture between them.
 */
function bubbleMaterial(text, script) {
  const key = `${script}|${text}`
  const hit = bubbleCache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  const face = BUBBLE_FONT[script] ?? BUBBLE_FONT.Devanagari

  ctx.fillStyle = 'rgba(255,252,242,0.94)'
  roundRect(ctx, 6, 6, 244, 62, 14)
  ctx.fill()
  // The tail, so it reads as speech rather than a label.
  ctx.beginPath()
  ctx.moveTo(112, 66)
  ctx.lineTo(126, 88)
  ctx.lineTo(142, 66)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#20180c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = 40
  ctx.font = `600 ${size}px ${face}, sans-serif`
  while (ctx.measureText(text).width > 218 && size > 16) {
    size -= 2
    ctx.font = `600 ${size}px ${face}, sans-serif`
  }
  ctx.fillText(text, 128, 38)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  bubbleCache.set(key, material)
  return material
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ------------------------------------------------------------------ *
 * The system
 * ------------------------------------------------------------------ */

export class MarketLife {
  /**
   * @param {object} world a BaseWorld
   * @param {{
   *   stalls?: Array<{slot: {x: number, z: number, rotY: number}, id: string}>,
   *   loiter?: Array<{x: number, z: number}>,
   *   patrol?: [{x: number, z: number}, {x: number, z: number}],
   *   busy?: Array<{x0: number, x1: number, z0: number, z1: number, weight?: number}>,
   *   shoppers?: number, seed?: number, language?: string, script?: string,
   * }} opts
   */
  constructor(world, opts) {
    this.world = world
    this.rand = mulberry32(opts.seed ?? 8181)
    this.script = opts.script ?? 'Devanagari'
    this.lines = AMBIENT_LINES[opts.language] ?? AMBIENT_LINES['hi-IN']
    this.patrol = opts.patrol
    this.tick = 0
    this.t = 0
    this.agents = []
    this.keepers = []

    /** Where a customer stands to be served: out in front of each stall. */
    this.stations = (opts.stalls ?? []).map((s) => {
      const fx = Math.sin(s.slot.rotY)
      const fz = Math.cos(s.slot.rotY)
      return {
        x: s.slot.x + fx * 1.6,
        z: s.slot.z + fz * 1.6,
        facing: s.slot.rotY + Math.PI,
        stall: s,
        weight: 1,
      }
    })
    for (const spot of opts.loiter ?? []) this.stations.push({ weight: 1, ...spot })

    // Stalls run down every edge of the quarter, so spreading the crowd evenly
    // across them put most of it round the back where nobody goes and left the
    // gali the player is standing in looking deserted. `busy` marks the streets
    // that are meant to be full, and people are drawn to them several times
    // more often — which is also simply true of markets.
    if (opts.busy) {
      for (const st of this.stations) {
        for (const r of opts.busy) {
          if (st.x >= r.x0 && st.x <= r.x1 && st.z >= r.z0 && st.z <= r.z1) {
            st.weight = r.weight ?? 4
            break
          }
        }
      }
    }
    this.weightTotal = this.stations.reduce((sum, st) => sum + st.weight, 0)

    for (const stall of opts.stalls ?? []) this.addKeeper(stall)
    this.addShoppers(opts.shoppers ?? 14)
    if (this.patrol) this.addPorter()
    this.addVignettes()

    this.cap = this.movers().length
  }

  /* ---------------- construction ---------------- */

  movers() {
    return this.agents.filter((a) => a.kind === 'shopper' || a.kind === 'child')
  }

  /** The host's overlay counts heads; keepers and posers are heads too. */
  get people() {
    return this.agents
  }

  /**
   * One body in two forms: the rig that animates, and the one-mesh proxy baked
   * straight off it — so the distant silhouette is literally the same person in
   * the same clothes as the one you walk up to.
   */
  body(preset, { scale = 1, pose = 'walk' } = {}) {
    const rig = makePerson({ seed: Math.floor(this.rand() * 1e6), preset }, undefined)
    // Twenty-odd shadow casters is the entire shadow budget, and the market
    // reads fine with people ungrounded because the tarps above them cast.
    rig.traverse((o) => {
      if (o.isMesh) o.castShadow = false
    })
    // Baked before either is scaled, because the bake reads world matrices.
    const proxy = makeProxyBody(rig, { pose })
    if (scale !== 1) {
      rig.scale.setScalar(scale)
      proxy.scale.setScalar(scale)
    }
    proxy.visible = false
    this.world.scene.add(rig, proxy)
    return { rig, proxy }
  }

  /** One shopkeeper behind every stall, facing out into the gali. */
  addKeeper(stall) {
    // Behind the goods, looking out over them at the gali — which is also
    // exactly where a player has to stand to be talking to them.
    const facing = stall.slot.rotY
    const { rig, proxy } = this.body(this.rand() > 0.55 ? 'kurta_pyjama' : 'shirt_trousers', {
      pose: 'stand',
    })
    const x = stall.slot.x - Math.sin(facing) * 1.15
    const z = stall.slot.z - Math.cos(facing) * 1.15
    rig.position.set(x, 0, z)
    rig.rotation.y = facing
    proxy.position.set(x, 0, z)
    proxy.rotation.y = facing

    const keeper = {
      kind: 'keeper',
      group: rig,
      proxy,
      stall,
      phase: this.rand() * 6,
      gait: 0,
      heading: facing,
      /** Where they face when nobody is talking to them: out over the goods. */
      baseHeading: facing,
      // Staggered, so the whole row does not reach for goods in unison.
      serveAt: 3 + this.rand() * 7,
      serving: 0,
      bubble: null,
      bubbleLeft: 0,
      talkAt: 5 + this.rand() * 14,
      voice: 'keeper',

      // Filled in by the world's cast binder if a scenario character is
      // stationed here. Until then this is a nameless extra, and the
      // interaction layer has nothing to offer the player.
      id: null,
      name: null,

      /**
       * Turn and look at whoever is talking. `SimHost.talkTo` calls this
       * optional-chained, so without it the keeper would keep facing the gali
       * while the player stood at their shoulder having a conversation.
       *
       * It only leans: the keeper's whole pose is built around standing behind
       * their goods, and swinging them bodily round pulls them off the stall.
       */
      faceToward: (x, z) => {
        const want = Math.atan2(x - rig.position.x, z - rig.position.z)
        const diff = ((want - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        keeper.heading = facing + Math.max(-0.7, Math.min(0.7, diff))
      },
    }
    // So the world's binder can find the keeper standing at a given stall.
    stall.keeper = keeper
    this.agents.push(keeper)
    this.keepers.push(keeper)
    return keeper
  }

  /**
   * Shoppers, a good half of them in company.
   *
   * A pair walks as a leader plus a follower holding a fixed offset, so they
   * arrive and leave together and read as two people who came to the market
   * with each other rather than two strangers who happen to be adjacent.
   */
  addShoppers(count) {
    let made = 0
    let n = 0
    while (made < count) {
      // Cycled rather than rolled. Leaving group shape to chance gave a market
      // of twenty-two adults and one child, which is not what a Sunday bazaar
      // looks like; the cycle guarantees the mix and the jitter inside each
      // group keeps it from reading as a pattern.
      const shape = GROUPS[n++ % GROUPS.length]
      const leader = this.addShopper()
      made++

      for (const role of shape) {
        if (made >= count) break
        const member = role === 'child' ? this.addChild() : this.addShopper()
        member.leader = leader
        // Followers walk at one shoulder and a step behind; children trail
        // further, which is what gives them something to run to catch up to.
        const side = this.rand() > 0.5 ? 1 : -1
        member.offset =
          role === 'child'
            ? { x: side * (0.9 + this.rand() * 0.5), z: -(1.1 + this.rand() * 0.9) }
            : { x: side * (0.7 + this.rand() * 0.35), z: -(0.3 + this.rand() * 0.4) }
        made++
      }
    }
  }

  addShopper() {
    const agent = this.walker('shopper', PRESETS[Math.floor(this.rand() * PRESETS.length)], 1)
    agent.state = this.rand() > 0.5 ? 'browse' : 'walk'
    agent.timer = this.rand() * 6
    this.agents.push(agent)
    return agent
  }

  addChild() {
    const agent = this.walker('child', this.rand() > 0.5 ? 'shirt_trousers' : 'salwar_kameez', 0.66)
    // Children in this market are seen and not heard.
    agent.talkAt = Infinity
    // How long before it wanders off from whoever brought it. See `stray`.
    agent.strayAt = 3 + this.rand() * 8
    agent.strayLeft = 0
    agent.strayTo = null
    this.agents.push(agent)
    return agent
  }

  /**
   * A child breaks away and then sprints back.
   *
   * Without this a child simply tracks its parent at a fixed offset and never
   * gets far enough behind to trigger the run — which is the one behaviour
   * everybody recognises. So every few seconds it goes and looks at something
   * three or four metres away, and by the time it turns round the adult has
   * moved on and it has to bolt.
   */
  stray(agent) {
    const p = agent.group.position
    const a = this.rand() * Math.PI * 2
    const r = 2.5 + this.rand() * 2.5
    agent.strayTo = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }
    agent.strayLeft = 1.5 + this.rand() * 2.5
    agent.strayAt = 5 + this.rand() * 9
  }

  walker(kind, preset, scale) {
    const { rig, proxy } = this.body(preset, { scale })
    const agent = {
      kind,
      group: rig,
      proxy,
      state: 'walk',
      timer: 1 + this.rand() * 3,
      phase: this.rand() * Math.PI * 2,
      gait: 0,
      pace: lerp(PACE[kind] ?? PACE.shopper, this.rand()),
      heading: this.rand() * Math.PI * 2,
      target: null,
      leader: null,
      bubble: null,
      bubbleLeft: 0,
      talkAt: 8 + this.rand() * 20,
      voice: 'shopper',
    }
    this.placeAtStation(agent)
    this.pickTarget(agent)
    return agent
  }

  /** A porter with a load, walking end to end. Gives the gali a current. */
  addPorter() {
    const agent = this.walker('porter', 'lungi', 1)
    agent.leg = 0
    agent.talkAt = Infinity
    agent.target = { ...this.patrol[1] }
    agent.group.position.set(this.patrol[0].x, 0, this.patrol[0].z)
    agent.proxy.position.copy(agent.group.position)

    // The load rides on the rig only: it is one more draw call up close, and
    // the proxy's silhouette is doing no work at thirty metres anyway.
    const load = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.42, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 1 })
    )
    load.position.set(0, 1.92, 0)
    load.rotation.y = 0.2
    agent.group.add(load)

    this.agents.push(agent)
  }

  /**
   * Two posed scenes that never move.
   *
   * A pair frozen mid-haggle at a stall and a knot of men standing at the chai
   * tapri are what make the gali look like people are STAYING somewhere, rather
   * than all passing through on their way out.
   */
  addVignettes() {
    const stalls = this.stations.filter((s) => s.stall)
    if (!stalls.length) return

    // Someone at the counter of roughly every third stall, on the busy streets
    // first. A keeper standing alone behind his goods reads as a shop that is
    // open; a keeper with somebody in front of him reads as a shop that is
    // BUSY, and that is the whole difference between a set and a market.
    const served = stalls
      .filter((s) => s.weight > 1)
      .concat(stalls.filter((s) => s.weight <= 1))
    for (let i = 0; i < served.length; i += 3) {
      const st = served[i]
      const side = (this.rand() - 0.5) * 0.9
      this.addPoser(
        PRESETS[Math.floor(this.rand() * PRESETS.length)],
        st.x + Math.cos(st.facing) * side,
        st.z - Math.sin(st.facing) * side,
        st.facing,
        // One in three is mid-haggle, leaning in. The rest just stand there.
        this.rand() > 0.66 ? 0.4 : 0.12
      )
    }

    // And a knot of men standing at the chai tapri, which is the one place in
    // any market where people stay put.
    const chai = stalls.find((s) => s.stall?.id === 'chai_tapri') ?? stalls[stalls.length - 1]
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const x = chai.x + Math.cos(a) * 1.15
      const z = chai.z + Math.sin(a) * 1.15
      // Facing the middle of the circle, which is what makes it read as a group
      // rather than three people who happened to stop near each other.
      this.addPoser(i === 1 ? 'lungi' : 'shirt_trousers', x, z, Math.atan2(chai.x - x, chai.z - z), 0)
    }
  }

  addPoser(preset, x, z, heading, gesture) {
    const { rig, proxy } = this.body(preset, { pose: 'stand' })
    rig.position.set(x, 0, z)
    rig.rotation.y = heading
    proxy.position.set(x, 0, z)
    proxy.rotation.y = heading
    this.agents.push({
      kind: 'poser',
      group: rig,
      proxy,
      phase: this.rand() * 6,
      gait: 0,
      heading,
      gesture,
      bubble: null,
      bubbleLeft: 0,
      talkAt: 4 + this.rand() * 12,
      voice: 'shopper',
    })
  }

  /** Roulette over `weight`, so the busy streets get most of the traffic. */
  pickStation() {
    if (!this.stations.length) return null
    let r = this.rand() * this.weightTotal
    for (const st of this.stations) {
      r -= st.weight
      if (r <= 0) return st
    }
    return this.stations[this.stations.length - 1]
  }

  placeAtStation(agent) {
    const s = this.pickStation() ?? { x: 0, z: 0 }
    agent.group.position.set(s.x + (this.rand() - 0.5) * 2.5, 0, s.z + (this.rand() - 0.5) * 2.5)
  }

  pickTarget(agent) {
    const s = this.pickStation()
    if (!s) return
    agent.target = {
      x: s.x + (this.rand() - 0.5) * 2.2,
      z: s.z + (this.rand() - 0.5) * 2.2,
      facing: s.facing,
    }
  }

  /* ---------------- runtime ---------------- */

  /** Retire or restore shoppers to hold a frame budget. Keepers are never cut. */
  setCap(cap) {
    const movers = this.movers()
    const want = Math.max(2, Math.min(34, Math.round(cap)))
    if (movers.length > want) {
      for (const a of movers.slice(want)) this.retire(a)
    } else if (movers.length < want) {
      this.addShoppers(want - movers.length)
    }
    this.cap = this.movers().length
  }

  retire(agent) {
    this.world.scene.remove(agent.group, agent.proxy)
    disposeProxy(agent.proxy)
    const i = this.agents.indexOf(agent)
    if (i >= 0) this.agents.splice(i, 1)
    // A follower whose leader has gone home carries on by itself.
    for (const other of this.agents) if (other.leader === agent) other.leader = null
  }

  update(dt, playerPos) {
    this.t += dt
    this.tick = (this.tick + 1) % 2

    for (const agent of this.agents) {
      const dx = agent.group.position.x - playerPos.x
      const dz = agent.group.position.z - playerPos.z
      const d2 = dx * dx + dz * dz

      if (d2 > CULL * CULL) {
        agent.group.visible = false
        agent.proxy.visible = false
        continue
      }

      const near = d2 < RIG * RIG
      agent.group.visible = near
      agent.proxy.visible = !near

      // Movement runs whether or not the rig is drawn, so the market keeps
      // living behind you and is not caught standing still when you turn round.
      // Only out at the edges is it stepped at half rate.
      if (!near && this.tick === 1) {
        this.syncProxy(agent)
        continue
      }
      this.stepAgent(agent, near ? dt : dt * 2, near)
      if (near) this.stepBubble(agent, dt, d2)
      else this.syncProxy(agent)
    }
  }

  /** Carries the rig's position onto the proxy and runs the two-frame walk. */
  syncProxy(agent) {
    const p = agent.proxy
    p.position.copy(agent.group.position)
    p.rotation.y = agent.group.rotation.y
    if (agent.gait > 0.2) setProxyFrame(p, Math.floor(this.t * 3.2 * agent.gait))
  }

  stepAgent(agent, dt, near) {
    switch (agent.kind) {
      case 'keeper':
        return this.stepKeeper(agent, dt, near)
      case 'poser':
        if (near) this.stepPoser(agent)
        return
      case 'porter':
        return this.stepPorter(agent, dt, near)
      default:
        return this.stepWalker(agent, dt, near)
    }
  }

  /**
   * The shopkeeper. Mostly still, then reaches for something.
   *
   * `people.ts` exposes no arm control, only the gait blend, so the reach is
   * faked with a forward lean and a small dip — which at three metres under a
   * tarp is exactly what handing over a bag of tomatoes looks like.
   */
  stepKeeper(agent, dt, near) {
    agent.serveAt -= dt
    if (agent.serveAt <= 0) {
      agent.serving = 1.1
      agent.serveAt = 5 + this.rand() * 9
    }
    if (agent.serving > 0) agent.serving -= dt
    if (!near) return

    // Drift back to facing the gali once whoever leaned in has walked off,
    // otherwise a keeper stays skewed at the empty air where a player used to
    // be for the rest of the run.
    if (agent.heading !== agent.baseHeading) {
      agent.heading = angleTowards(agent.heading, agent.baseHeading, dt * 0.8)
    }

    if (agent.serving > 0) {
      const k = Math.sin(((1.1 - agent.serving) * Math.PI) / 1.1)
      agent.group.position.y = -0.08 * k
      agent.group.rotation.y = agent.heading + 0.22 * k
      setWalkPhase(agent.group, 0, 0, 0.3 * k, this.t)
    } else {
      agent.group.position.y = 0
      agent.group.rotation.y = agent.heading
      setIdlePhase(agent.group, this.t + agent.phase)
    }
  }

  /** Posed figures: no movement, just breathing, and a lean if haggling. */
  stepPoser(agent) {
    setWalkPhase(
      agent.group,
      0,
      0,
      agent.gesture * Math.sin(this.t * 1.1) * 0.5,
      this.t + agent.phase
    )
  }

  stepPorter(agent, dt, near) {
    const t = agent.target
    const dx = t.x - agent.group.position.x
    const dz = t.z - agent.group.position.z
    if (Math.hypot(dx, dz) < 1.2) {
      agent.leg = 1 - agent.leg
      agent.target = { ...this.patrol[agent.leg] }
      return
    }
    const want = Math.atan2(dx, dz)
    agent.heading = angleTowards(agent.heading, want, dt * 2.6)
    const step = agent.pace * dt
    agent.group.position.x += Math.sin(agent.heading) * step
    agent.group.position.z += Math.cos(agent.heading) * step
    agent.group.rotation.y = agent.heading
    agent.phase += (step / 0.62) * Math.PI
    agent.gait = 1
    // A load on the head means a stiff, level walk: no lean, no run blend.
    if (near) setWalkPhase(agent.group, agent.phase, 1, 0, this.t)
  }

  /** Shoppers and children: walk to something, look at it, move on. */
  stepWalker(agent, dt, near) {
    // A child that is off on its own ignores whoever brought it until it is
    // done, and only then has to find them again.
    if (agent.kind === 'child' && agent.leader) {
      if (agent.strayLeft > 0) {
        agent.strayLeft -= dt
        agent.target = agent.strayTo
      } else {
        agent.strayAt -= dt
        if (agent.strayAt <= 0) this.stray(agent)
      }
    }

    // A follower's target is wherever its leader is, offset to one shoulder.
    if (agent.leader && !(agent.strayLeft > 0)) {
      const L = agent.leader.group.position
      const h = agent.leader.heading
      agent.target = {
        x: L.x + Math.cos(h) * agent.offset.x + Math.sin(h) * agent.offset.z,
        z: L.z - Math.sin(h) * agent.offset.x + Math.cos(h) * agent.offset.z,
      }
    }

    agent.timer -= dt

    if (!agent.leader && agent.state === 'browse') {
      agent.gait += (0 - agent.gait) * Math.min(1, dt * 6)
      if (agent.timer <= 0) {
        this.pickTarget(agent)
        agent.state = 'walk'
      }
      agent.group.rotation.y = agent.heading
      if (near) setWalkPhase(agent.group, agent.phase, agent.gait, 0, this.t)
      return
    }

    const t = agent.target
    if (!t) {
      agent.state = 'browse'
      agent.timer = 4
      return
    }

    const dx = t.x - agent.group.position.x
    const dz = t.z - agent.group.position.z
    const dist = Math.hypot(dx, dz)
    const attached = agent.leader && !(agent.strayLeft > 0)
    // A follower only closes to arm's length; a shopper stops at the counter.
    const stopAt = attached ? 0.5 : 0.6

    if (dist < stopAt) {
      if (!attached) {
        agent.state = 'browse'
        // Long enough to read as looking at something, short enough that the
        // market keeps moving. Children have no patience at all.
        agent.timer = agent.kind === 'child' ? 1 + this.rand() * 2 : 4 + this.rand() * 5
        if (t.facing !== undefined) agent.heading = t.facing
      }
      agent.gait += (0 - agent.gait) * Math.min(1, dt * 5)
    } else {
      const want = Math.atan2(dx, dz)
      agent.heading = angleTowards(agent.heading, want, dt * 3.4)
      // A child that has fallen behind sprints to catch up — the single most
      // recognisable thing a child does in a market.
      const chasing = agent.kind === 'child' && dist > 3
      const step = agent.pace * (chasing ? 1.45 : 1) * dt
      const nx = agent.group.position.x + Math.sin(agent.heading) * step
      const nz = agent.group.position.z + Math.cos(agent.heading) * step

      // Zones are the truth about where anyone may stand: a shopper who walks
      // at a shopfront is shoved back out rather than clipping through it.
      if (this.world.zones?.allows?.('pedestrian', nx, nz) === false) {
        const [lx, lz] = this.world.zones.nearestLegal('pedestrian', nx, nz)
        agent.group.position.set(lx, 0, lz)
        // A child that has run at a wall has finished wandering; anyone
        // unattached just picks somewhere else to be.
        if (agent.strayLeft > 0) agent.strayLeft = 0
        else if (!agent.leader) this.pickTarget(agent)
      } else {
        agent.group.position.set(nx, 0, nz)
      }

      const wantGait = agent.kind === 'child' ? (chasing ? 2 : 1.35) : 1
      agent.gait += (wantGait - agent.gait) * Math.min(1, dt * 5)
      agent.phase += (step / (agent.kind === 'child' ? 0.42 : 0.62)) * Math.PI
    }

    agent.group.rotation.y = agent.heading
    if (near) setWalkPhase(agent.group, agent.phase, agent.gait, 0, this.t)
  }

  /** Occasional one-line bubbles, only from people close enough to read one. */
  stepBubble(agent, dt, d2) {
    if (agent.bubbleLeft > 0) {
      agent.bubbleLeft -= dt
      if (agent.bubbleLeft <= 0 && agent.bubble) {
        agent.group.remove(agent.bubble)
        agent.bubble = null
      }
      return
    }
    agent.talkAt -= dt
    if (agent.talkAt > 0 || d2 > TALK * TALK) return

    const pool = this.lines[agent.voice] ?? this.lines.shopper
    const line = pool[Math.floor(this.rand() * pool.length)]
    try {
      const sprite = new THREE.Sprite(bubbleMaterial(line, this.script))
      sprite.scale.set(1.5, 0.56, 1)
      // Children are shorter, and their whole rig is scaled, so the bubble has
      // to be pushed further up in local space to clear the same head.
      sprite.position.y = agent.kind === 'child' ? 3.1 : 2.15
      agent.group.add(sprite)
      agent.bubble = sprite
      agent.bubbleLeft = 2.6
    } catch {
      /* no canvas: the market is quieter, nothing else changes */
    }
    agent.talkAt = 10 + this.rand() * 20
  }

  dispose() {
    for (const a of this.agents) {
      this.world.scene.remove(a.group, a.proxy)
      disposeProxy(a.proxy)
    }
    this.agents.length = 0
    this.keepers.length = 0
  }
}

/* ------------------------------------------------------------------ */

function lerp([a, b], t) {
  return a + (b - a) * t
}

/** Shortest-way angle step, so nobody turns the long way round. */
function angleTowards(from, to, maxStep) {
  const diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  if (Math.abs(diff) < maxStep) return to
  return from + Math.sign(diff) * maxStep
}
