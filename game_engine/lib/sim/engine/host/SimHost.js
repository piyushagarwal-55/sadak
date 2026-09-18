import * as THREE from 'three'
import { Input } from '../core/Input.js'
import { lerpAngle } from '../core/util.js'
import {
  applyEnvironment,
  buildEnvironment,
  createComposer,
  createRenderer,
  QualityGuard,
} from '../core/Renderer.js'
import { Player } from '../world/Player.js'

/**
 * SIM HOST
 *
 * The ShopVerse worlds were written against a `Game` object: they call
 * `game.talkTo(npc)`, read `game.player.pos`, toast through `game.ui`, and
 * switch between each other with `game.switchWorld(key)`. That `Game` also
 * owned a shopping cart, a phone, an AR try-on stack, drops, sessions and a
 * whole UI — none of which belongs in SADAK.
 *
 * So this is the same contract with the shopping cut out: renderer, camera,
 * player, input and the frame loop, plus stubs for the handful of commerce
 * hooks the ported code still reaches for.
 *
 * It owns no worlds. ShopVerse hard-wired five into a registry and built all
 * five at startup; a generated situation is ONE world, built from a spec that
 * did not exist a moment ago, so the host takes a factory and mounts whatever
 * it returns. Interiors, when they arrive, are another `mount` call.
 *
 * The camera rig, the occlusion pull-in and the follow behaviour are ported as
 * written rather than reinvented — they are tuned, and the tuning is most of
 * why the original feels good to walk around in.
 *
 * Browser only: the worlds draw canvas textures at construction.
 */

export class SimHost {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   onPrompt?: (label: string | null) => void,
   *   onTalk?: (character: any) => void,
   *   onLocation?: (title: string, key: string) => void,
   *   onProgress?: (label: string, fraction: number) => void,
   *   onToast?: (message: string) => void,
   *   onStats?: (s: {calls: number, tris: number, programs: number, ms: number, crowd: number}) => void,
   * }} [hooks]
   */
  constructor(container, hooks = {}) {
    this.hooks = hooks
    this.renderer = createRenderer(container)

    this.baseFov = 60
    // Far must clear the sky dome (kit/sky.js, radius 420 — it follows the
    // camera, so that radius IS the view distance) plus the ground plane's far
    // corners. Below 600 the dome falls outside the frustum and the sky goes
    // black; this number is load-bearing.
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.1, 600)
    this.camYaw = 0
    this.camPitch = 0.42
    this.camDist = 6.5
    this.curDist = 6.5
    this.dragOverride = 0
    this.camAnchor = new THREE.Vector3()
    this.camGoal = new THREE.Vector3()
    this.shakeAmp = 0
    this.shakeTime = 0

    this.input = new Input()
    this.player = new Player('You')
    this.clock = new THREE.Clock()
    this.currentInteractable = null
    this.world = null
    this.activeWorld = null
    this.running = false

    // Post-processing measured ~35% of frame time while moving in the original,
    // so it ships off and is opted into.
    this.postEnabled = false
    this.quality = new QualityGuard({
      onDowngrade: (avg) => {
        this.postEnabled = false
        this.toast('Reduced effects to keep things smooth')
        console.info(`[sim] post-FX disabled — avg frame ${avg.toFixed(1)}ms`)
      },
    })

    /* ---- the surface the worlds expect of a `game` ---- */

    this.ui = {
      locked: false,
      toast: (message) => this.toast(message),
      prompt: (label) => this.hooks.onPrompt?.(label ?? null),
      setLocation: (title) => this.hooks.onLocation?.(title),
      setStage: () => {},
      openCampus: () => {},
    }
    // The worlds call into audio on entry and every frame. Silent for now —
    // SADAK has its own audio engine (lib/audio) to route this into later.
    this.audio = {
      setScene: () => {},
      tickFeet: () => {},
      ambientTick: () => {},
      chime: () => {},
    }
    this.session = { reset: () => {} }

    this._onResize = () => this.resize()
    window.addEventListener('resize', this._onResize)
    this.bindPointer()
  }

  /* ------------------------------------------------------------------ *
   * Build
   * ------------------------------------------------------------------ */

  /**
   * Builds one world and shows it.
   *
   * `factory` is handed this host (the worlds' `game`) and returns a
   * `BaseWorld`. Construction is the slow part — a dressed lane is thousands of
   * meshes — so each phase yields to the browser; otherwise the whole build
   * lands in one frame and the page freezes with no way to paint progress.
   *
   * The environment map and the composer are built once and reused, so mounting
   * a second world (an interior, later) costs only that world's geometry.
   *
   * @param {(game: SimHost) => object} factory
   * @param {{label?: string}} [opts]
   */
  async mount(factory, opts = {}) {
    const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    const steps = [
      [opts.label ?? 'Laying out the place', () => (this.world = factory(this))],
      [
        'Lighting the scene',
        () => {
          // PMREM over three's RoomEnvironment. This one line is most of why
          // every surface reads as lit rather than flat-shaded.
          this.envTexture ??= buildEnvironment(this.renderer)
          applyEnvironment(this.world.scene, this.envTexture, this.world.envKind)
        },
      ],
      [
        'Warming the renderer',
        () => {
          if (this.composer) return
          const fx = createComposer(this.renderer, this.world.scene, this.camera)
          this.composer = fx.composer
          this.renderPass = fx.renderPass
          this.bloom = fx.bloom
        },
      ],
    ]

    for (let i = 0; i < steps.length; i++) {
      const [label, run] = steps[i]
      this.hooks.onProgress?.(label, i / steps.length)
      await yieldFrame()
      run()
    }
    this.hooks.onProgress?.('Stepping in', 1)
    await yieldFrame()

    this.resize()
    this.enter(this.world, 'default')
    return this.world
  }

  /* ------------------------------------------------------------------ *
   * Worlds
   * ------------------------------------------------------------------ */

  /** Puts the player into a world at one of its spawn tags. */
  enter(world, tag = 'entry') {
    if (!world) return
    if (this.activeWorld && this.activeWorld !== world) {
      this.activeWorld.scene.remove(this.player.group)
    }

    this.activeWorld = world
    world.scene.add(this.player.group)

    const s = world.spawn(tag)
    this.player.pos.set(s.x, 0, s.z)
    this.player.heading = s.heading ?? Math.PI
    this.player.avatar.visual.rotation.y = this.player.heading
    this.camYaw = s.camYaw ?? 0
    // Reset the tilt too: walking in still craned at the sky left you staring
    // at the ceiling.
    this.camPitch = s.camPitch ?? 0.42
    this.camDist = world.camDist
    this.curDist = world.camDist
    this.currentInteractable = null
    this.updateCamera(0, true)
    this.ui.setLocation(world.title)
    world.onEnter?.(tag)
  }

  /**
   * Walks into one of the mounted world's interiors.
   *
   * The ported worlds call `game.switchWorld('cafe')` from their door
   * interactables, so the name stays — but it no longer indexes a registry of
   * five worlds built at startup. An archetype registers `interiorFactories`,
   * and the interior is CONSTRUCTED on first entry: four of them sit behind
   * doors the player may never open, and building them all up front was most of
   * the original's four-second start.
   */
  switchWorld(key, tag = 'entry') {
    if (!this.interiors) return
    let world = this.interiors[key]
    if (!world && this.interiorFactories?.[key]) {
      world = this.interiorFactories[key]()
      if (this.envTexture) applyEnvironment(world.scene, this.envTexture, world.envKind)
      this.interiors[key] = world
    }
    if (world) this.enter(world, tag)
  }

  /* ---- commerce hooks the ported worlds still reach for ---- */
  openCheckout() {}
  openARWall() {}

  talkTo(character) {
    character.faceToward?.(this.player.pos.x, this.player.pos.z)
    this.hooks.onTalk?.(character)
  }

  toast(message) {
    this.hooks.onToast?.(message)
  }

  /* ------------------------------------------------------------------ *
   * Interaction
   * ------------------------------------------------------------------ */

  scanInteractables() {
    if (this.ui.locked) {
      this.currentInteractable = null
      this.ui.prompt(null)
      return
    }
    let best = null
    let bestD = Infinity
    for (const it of this.activeWorld.interactables) {
      if (it.when && !it.when(this)) continue
      const p = it.pos()
      const d = Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z)
      if (d < it.radius && d < bestD) {
        best = it
        bestD = d
      }
    }
    if (best !== this.currentInteractable) this.ui.prompt(best ? best.label : null)
    this.currentInteractable = best
  }

  interact() {
    if (this.currentInteractable && !this.ui.locked) this.currentInteractable.action(this)
  }

  pointBlocked(x, z, y) {
    for (const b of this.activeWorld.colliders) {
      if (y < (b.h ?? 3) && x > b.minX - 0.25 && x < b.maxX + 0.25 && z > b.minZ - 0.25 && z < b.maxZ + 0.25) {
        return true
      }
    }
    return false
  }

  /* ------------------------------------------------------------------ *
   * Camera — ported as written; the tuning is the feel
   * ------------------------------------------------------------------ */

  updateCamera(dt, snap = false) {
    const p = this.player.pos
    // Looking up tilts the VIEW rather than dropping the camera: swinging below
    // eye line to see sky drove the rig straight through shopfronts.
    const posPitch = Math.max(this.camPitch, 0.06)
    const lookUp = this.camPitch < 0.06 ? (0.06 - this.camPitch) * 5.2 : 0
    const cp = Math.cos(posPitch)
    const dx = Math.sin(this.camYaw) * cp
    const dz = Math.cos(this.camYaw) * cp
    const sy = Math.sin(posPitch)

    const eyeY = 1.55 + p.y
    if (snap) this.camAnchor.set(p.x, eyeY, p.z)
    else this.camAnchor.lerp(this.camGoal.set(p.x, eyeY, p.z), Math.min(1, dt * 9))
    const a = this.camAnchor

    // Pull in when a wall or shelf sits between the camera and the player.
    let d = this.camDist
    for (let t = 0.8; t <= this.camDist; t += 0.35) {
      if (this.pointBlocked(p.x + dx * t, p.z + dz * t, 1.5 + sy * t)) {
        d = Math.max(1.15, t - 0.45)
        break
      }
    }
    // Snap in fast when the view is blocked, ease back out slowly.
    const k = d < this.curDist ? 18 : 4.5
    this.curDist = snap ? d : this.curDist + (d - this.curDist) * Math.min(1, dt * k)

    let tx = a.x + dx * this.curDist
    let ty = Math.max(0.45, a.y + sy * this.curDist)
    let tz = a.z + dz * this.curDist

    if (this.shakeTime > 0) {
      this.shakeTime -= dt
      const f = this.shakeAmp * Math.max(0, this.shakeTime)
      tx += (Math.random() - 0.5) * f * 3
      ty += (Math.random() - 0.5) * f * 3
      tz += (Math.random() - 0.5) * f * 3
      if (this.shakeTime <= 0) this.shakeAmp = 0
    }

    if (snap) this.camera.position.set(tx, ty, tz)
    else this.camera.position.lerp(this.camGoal.set(tx, ty, tz), Math.min(1, dt * 11))
    this.camera.lookAt(a.x, a.y + lookUp, a.z)

    const targetFov = this.baseFov + (this.player.speedRatio > 0.75 ? 7 : 0)
    const fov = snap ? targetFov : this.camera.fov + (targetFov - this.camera.fov) * Math.min(1, dt * 4)
    if (Math.abs(fov - this.camera.fov) > 0.01 || snap) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  bindPointer() {
    const el = this.renderer.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    this._onDown = (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    this._onMove = (e) => {
      if (!dragging) return
      // Any manual look holds off the follow-cam for a moment, so the rig does
      // not fight the player's hand.
      this.dragOverride = 1.2
      this.camYaw -= (e.clientX - lastX) * 0.005
      this.camPitch = Math.min(1.2, Math.max(-0.35, this.camPitch + (e.clientY - lastY) * 0.004))
      lastX = e.clientX
      lastY = e.clientY
    }
    this._onUp = (e) => {
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }
    this._onWheel = (e) => {
      e.preventDefault()
      this.camDist = Math.min(14, Math.max(2.5, this.camDist * (1 + Math.sign(e.deltaY) * 0.12)))
    }
    this._onKey = (e) => {
      if (e.code === 'KeyE') this.interact()
    }

    el.addEventListener('pointerdown', this._onDown)
    el.addEventListener('pointermove', this._onMove)
    el.addEventListener('pointerup', this._onUp)
    el.addEventListener('wheel', this._onWheel, { passive: false })
    window.addEventListener('keydown', this._onKey)
  }

  resize() {
    const el = this.renderer.domElement
    const w = el.parentElement?.clientWidth || window.innerWidth
    const h = el.parentElement?.clientHeight || window.innerHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ------------------------------------------------------------------ *
   * Loop
   * ------------------------------------------------------------------ */

  start() {
    this.running = true
    this.clock.start()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  tick() {
    const world = this.activeWorld
    if (!world) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const now = performance.now()
    const frameMs = this.lastFrameAt ? now - this.lastFrameAt : 16.7
    this.lastFrameAt = now
    // `autoReset` is off in createRenderer so the counters survive a multi-pass
    // composer frame; that means resetting here, once, is our job.
    this.renderer.info.reset()

    if (!this.ui.locked) this.player.update(dt, this.input, this.camYaw, world)

    // Third-person follow: swing in behind the character so you see what they
    // see, unless the player is currently dragging the camera themselves.
    this.dragOverride = Math.max(0, this.dragOverride - dt)
    const { x: ax, z: az } = this.input.axis()
    if ((ax !== 0 || az !== 0) && !this.dragOverride && !this.ui.locked) {
      this.camYaw = lerpAngle(this.camYaw, this.player.heading + Math.PI, 1 - Math.pow(0.05, dt))
    }

    world.update(dt)
    this.scanInteractables()
    this.updateCamera(dt)
    for (const m of world.mirrors) m.update(this.renderer, world.scene, this.player)

    if (this.postEnabled && this.composer) {
      this.renderPass.scene = world.scene
      this.composer.render(dt)
    } else {
      this.renderer.render(world.scene, this.camera)
    }
    this.quality.sample(frameMs)

    // Smoothed so the overlay is readable rather than a blur of digits.
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.9 + frameMs * 0.1 : frameMs

    // Adaptive crowd. The demo laptop has an Intel UHD, so rather than let the
    // whole scene degrade the moment the budget is missed, people are retired
    // two at a time and brought back when there is room. Slow on purpose: a
    // crowd that resizes every second is more distracting than a dropped frame.
    const crowd = world.crowd
    if (crowd && now - (this.lastCrowdAt ?? 0) > 2500) {
      this.lastCrowdAt = now
      // The thresholds are deliberately slack. At >21ms the demo laptop, which
      // sits around 30fps with everything on, would drain the market down to
      // six people within a minute — and an empty bazaar is a far worse demo
      // than a thirty-fps one. So the crowd only gives way below ~33fps, and
      // never past twelve, which is the fewest that still reads as a crowd.
      // The ceiling is 34 because distant bodies are a single baked mesh each.
      if (this.frameAvg > 30 && crowd.cap > 12) crowd.setCap(crowd.cap - 2)
      else if (this.frameAvg < 18 && crowd.cap < 34) crowd.setCap(crowd.cap + 2)
    }
    if (this.hooks.onStats && now - (this.lastStatsAt ?? 0) > 400) {
      this.lastStatsAt = now
      const info = this.renderer.info
      this.hooks.onStats({
        calls: info.render.calls,
        tris: info.render.triangles,
        programs: info.programs?.length ?? 0,
        ms: this.frameAvg,
        crowd: world.crowd?.people.length ?? 0,
      })
    }
  }

  dispose() {
    this.running = false
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('keydown', this._onKey)
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this._onDown)
    el.removeEventListener('pointermove', this._onMove)
    el.removeEventListener('pointerup', this._onUp)
    el.removeEventListener('wheel', this._onWheel)
    this.renderer.dispose()
    el.parentElement?.removeChild(el)
  }
}
