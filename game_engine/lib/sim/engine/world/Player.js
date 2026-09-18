import { HeroAvatar } from './HeroAvatar.js'
import { clamp } from '../core/util.js'
import { Character } from '../character/core/Character'

/**
 * Player — the shipping game's controllable character.
 *
 * Movement is now driven by the POUNCE character engine (`character/`): the
 * kinematic `Character` (MovementController + solvers) owns velocity, gravity,
 * jump, and capsule collision. This wrapper keeps the exact surface the rest of
 * the game consumes — `pos`, `heading`, `group`, `avatar`, `sit/stand`,
 * `sitting`, `speedRatio`, `radius`, `update(dt, input, camYaw, world)` — so it
 * drops straight into `Game` with no changes elsewhere.
 *
 * The procedural `Avatar` stays the visual: outfits, bag, name tag and the
 * seated pose are untouched. The engine drives where the body is; the Avatar
 * draws it.
 *
 * Two things the engine does not own, so this wrapper applies them on top each
 * frame, exactly as the legacy controller did:
 *   - Zones: "this ground is not yours" rules (`world.zones`), vetoed after the
 *     engine's collision so a collider can't wedge you somewhere illegal.
 *   - Bounds: the world's hard XZ rectangle.
 */
// Tuned down from the engine default (jog 6.4 / sprint 12.5) — that pace read
// too fast for the walkable plaza scale.
const JOG = 4.5
const SPRINT = 8.5 // must match speed.sprint below, for speedRatio

export class Player {
  constructor(name = 'You') {
    this.radius = 0.42

    // The engine. Its state.position is the source of truth for where we are.
    this.character = new Character({ speed: { jog: JOG, sprint: SPRINT } })
    const start = this.character.state.position
    start.set(0, 0, 0)
    this.character.state.heading = Math.PI

    // Rigged Xbot visual driven by the engine's presentation stack
    // (AnimationGraph + ProceduralSpine + FootIK). Reads the engine state.
    this.avatar = new HeroAvatar({ name, state: this.character.state })
    this.group = this.avatar.group

    // `pos` is the render position the game reads and writes (teleports, spawn,
    // minimap, camera). It IS the avatar group's position; we mirror the engine
    // into it every frame, and detect external writes to it as teleports.
    this.pos = this.group.position
    this.pos.set(0, 0, 0)
    // Last position we authored from the engine. If `pos` differs at the top of
    // update(), something outside moved us (a teleport) and we resync the engine.
    this._enginePos = start.clone()

    this.speedRatio = 0
    this.sitting = false
    this._world = null // last world whose colliders we loaded
  }

  // heading proxies the engine so `player.heading = x` (facing an NPC) writes
  // through, and reads reflect the engine's turn solver.
  get heading() {
    return this.character.state.heading
  }
  set heading(h) {
    this.character.state.heading = h
    this.avatar.visual.rotation.y = h
  }

  // Sit on a seat spot {x, z, heading, seatHeight}. Reuses the avatar's seated
  // pose; parks the engine at the seat with momentum cleared.
  sit(spot) {
    this.sitting = true
    this.character.teleport(spot.x, 0, spot.z, spot.heading ?? this.heading)
    this._enginePos.copy(this.character.state.position)
    this.pos.copy(this.character.state.position)
    this.avatar.visual.rotation.y = this.heading
    this.avatar.setSitting(true, spot.seatHeight ?? 0.46)
  }
  stand() {
    if (!this.sitting) return
    this.sitting = false
    this.avatar.setSitting(false)
  }

  update(dt, input, camYaw, world) {
    const state = this.character.state

    // Load this world's colliders into the engine once per world change.
    if (world !== this._world) {
      this.character.setColliders(world.colliders || [])
      this._world = world
    }

    // seated: stay put until the player tries to move (or is teleported away),
    // then stand. A phone/map teleport writes this.pos while seated; honor it.
    if (this.sitting) {
      const a = input.axis()
      const teleportedAway = !this.pos.equals(this._enginePos)
      if (a.x !== 0 || a.z !== 0 || teleportedAway) this.stand()
      else {
        this.avatar.update(dt, this.character.state, this.character.collisionWorld)
        return
      }
    }

    // If something outside the engine moved `pos` (phone teleport, spawn, world
    // transition), resync the engine to it and clear momentum so we don't lurch.
    if (!this.pos.equals(this._enginePos)) {
      this.character.teleport(this.pos.x, this.pos.y, this.pos.z, this.heading)
    }

    // If we are somehow standing somewhere illegal — teleported into a
    // footprint, or shoved there by a collider — walk out. The engine can't
    // fix this: zones are not its concern.
    if (world.zones && !world.zones.allows('pedestrian', state.position.x, state.position.z)) {
      const [rx, rz] = world.zones.nearestLegal('pedestrian', state.position.x, state.position.z)
      this.character.teleport(rx, 0, rz, this.heading)
    }

    // Camera-relative basis from the follow-cam yaw (matches the legacy basis).
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw)
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw)
    this._camF ||= { x: 0, y: 0, z: 0 }
    // reuse a plain object; Character.drive reads .x/.y/.z
    this._camF.x = fx; this._camF.y = 0; this._camF.z = fz
    this._camR ||= { x: 0, y: 0, z: 0 }
    this._camR.x = rx; this._camR.y = 0; this._camR.z = rz

    const { x, z } = input.axis()
    this._raw ||= { x: 0, y: 0 }
    this._raw.x = x; this._raw.y = z
    const jump = input.down('Space')
    const sprint = input.running
    const crouch = input.down('ControlLeft') || input.down('KeyC')

    // Drive + advance the engine.
    this.character.drive(this._raw, this._camF, this._camR, jump, sprint, crouch)
    this.character.tick(dt)

    // Zones veto after the engine's collision — a collider can legitimately
    // push you somewhere you're not allowed to be (into a shop's rear wall).
    if (world.zones) {
      const [nx, nz] = world.zones.resolve(
        'pedestrian',
        state.previousPosition.x, state.previousPosition.z,
        state.position.x, state.position.z,
      )
      state.position.x = nx
      state.position.z = nz
    }

    // Hard world bounds.
    const b = world.bounds
    if (b) {
      state.position.x = clamp(state.position.x, b.minX + this.radius, b.maxX - this.radius)
      state.position.z = clamp(state.position.z, b.minZ + this.radius, b.maxZ - this.radius)
    }

    // Publish the engine state to the render position + facing.
    this.pos.copy(state.position)
    this._enginePos.copy(state.position)
    this.avatar.visual.rotation.y = state.heading
    this.speedRatio = state.horizontalSpeed / SPRINT

    // Drive the rigged presentation from the engine state + the world colliders
    // the FootIK probes for the floor.
    this.avatar.update(dt, state, this.character.collisionWorld)
  }
}
