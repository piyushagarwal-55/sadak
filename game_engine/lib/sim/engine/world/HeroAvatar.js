import * as THREE from 'three'
import { textSprite } from '../core/util.js'
import { RiggedAvatar } from '../character/appearance/RiggedAvatar'
import { ProceduralSpine } from '../character/animation/ProceduralSpine'
import { MaterialController } from '../character/appearance/MaterialController'
import { Accessories } from '../character/appearance/Accessories'

/**
 * HeroAvatar — the rigged, animated player visual for the shipping world.
 *
 * Presents the exact surface the game already calls on `player.avatar`
 * (`visual`, `nameTag`, `hasBag`, `applyOutfit`, `giveBag`, `setSitting`,
 * `update`) so it drops in for the old procedural `Avatar` with no changes in
 * `Game`/`UI` — but under the hood it is the Xbot skinned rig driven by the
 * full character-engine presentation stack: AnimationGraph (idle→walk→run +
 * airborne), ProceduralSpine (lean into acceleration and turns), and FootIK
 * (feet plant on the ground).
 *
 * The GLB loads async; until it resolves the group is empty (movement still
 * works, the body just isn't drawn yet). Everything the game touches
 * synchronously — `visual`, `nameTag` — exists from construction.
 */

// Rig-facing offset. The engine's forward is (sin h, cos h) and the Xbot bind
// pose already aligns to it (verified in the playground with no offset), so the
// heading rotation on the outer group is applied straight — no extra turn, or
// the body moonwalks.
const MODEL_YAW = 0

// The player: a Mixamo character (character.fbx) with locomotion clips loaded
// from separate Mixamo FBX exports and bound onto its skeleton by bone name.
// Clean, fast mannequin: Xbot ships idle/walk/run in one small GLB, so there's
// a real idle pose (no stiff T-pose) and nothing extra to download. Swapping in
// a richer character later = point MODEL_URL at its file + list its clips.
const MODEL_URL = '/models/Xbot.glb'
const EXTRA_CLIPS = {}

// Facing offset per model: the engine forward is (sin h, cos h); if the body
// walks backwards, this turns the model to match.
const MODEL_YAW_BY_URL = {
  '/models/character.glb': 0,
  '/models/CesiumMan.glb': Math.PI / 2,
  '/models/Soldier.glb': 0,
  '/models/Xbot.glb': 0,
}

// Fallback tint used only for the bare Xbot mannequin submeshes; a textured
// model has no Beta_* meshes, so this never touches it.
const OUTFIT = { surface: '#3b6fd4', joints: '#1e2a44' }

export class HeroAvatar {
  /** @param {{name?: string, state?: any}} opts state = the CharacterState the
   *  presentation modules read (velocity, angularVelocity, ground). */
  constructor({ name = 'You', state = null } = {}) {
    this.name = name
    this.group = new THREE.Group()
    // The game sets `visual.rotation.y = heading`; rotating the outer group
    // turns the whole rig. The name tag sits on the Y axis so it stays centered.
    this.visual = this.group
    this.hasBag = false
    this.ready = false
    this._state = state
    this._sitting = false
    this._outfit = null

    // Seated pose (no sit clip on the Xbot rig). We bend a few bones toward a
    // modest seated offset and ease in/out with `_sitBlend`. Targets are
    // precomputed constants (`bind · offset`); nothing here allocates per frame.
    this._sitBlend = 0
    this._sitAxis = new THREE.Vector3(1, 0, 0) // medial-lateral (pitch) axis
    this._sitBones = null // THREE.Bone[] posed while seated
    this._sitTargets = null // matching THREE.Quaternion[] seated targets

    this.nameTag = textSprite(name)
    this.nameTag.position.y = 2.35 // above the ~2.1m model's head
    this.nameTag.scale.multiplyScalar(0.62) // smaller tag over the head
    this.group.add(this.nameTag)

    // Inner node carries the model-facing offset so the outer group's rotation
    // stays a clean heading.
    this._spin = new THREE.Group()
    this._spin.rotation.y = MODEL_YAW_BY_URL[MODEL_URL] ?? 0
    this.group.add(this._spin)

    this._rig = new RiggedAvatar()
    this._rig
      // A touch taller (2.1 vs the 1.8 capsule) so the player reads at the same
      // scale as the procedural crowd instead of looking small among them.
      .load(MODEL_URL, 2.1)
      .then(() => this._loadClips())
      .then(() => this._onReady())
      .catch((e) => console.error('[HeroAvatar] rig load failed', e))
  }

  async _loadClips() {
    // Bind the external locomotion clips onto the character's skeleton.
    for (const [name, url] of Object.entries(EXTRA_CLIPS)) {
      try {
        await this._rig.loadClip(name, url)
      } catch (e) {
        console.warn('[HeroAvatar] clip load failed:', name, e)
      }
    }
  }

  _onReady() {
    this._spin.add(this._rig.group)

    // Only the bare Xbot mannequin needs tinting; textured models leave their
    // real materials alone.
    this._rig.group.traverse((o) => {
      if (!o.isSkinnedMesh) return
      if (o.name === 'Beta_Surface' || o.name === 'Beta_Joints') {
        o.material = o.material.clone()
        o.material.color.set(o.name === 'Beta_Surface' ? OUTFIT.surface : OUTFIT.joints)
        o.material.roughness = 0.8
        o.material.metalness = 0.0
      }
    })

    const rig = this._rig
    // Locomotion actions (any subset that loaded). We blend them ourselves by
    // speed rather than via AnimationGraph, since a downloaded set may lack idle.
    this._idle = rig.getAction('idle') || null
    this._walk = rig.getAction('walk') || null
    this._run = rig.getAction('run') || null
    for (const a of [this._idle, this._walk, this._run]) {
      if (a) {
        a.enabled = true
        a.setLoop(THREE.LoopRepeat, Infinity)
        a.setEffectiveWeight(0)
        a.play()
      }
    }

    // Spine lean needs the Mixamo skeleton. Foot IK stays OFF in the world (the
    // walk clips plant the feet; IK on the flat plaza pushed them through it).
    this.spine = rig.hasSkeleton && this._state ? new ProceduralSpine(rig, this._state) : null

    this.material = new MaterialController(rig)
    this.accessories = new Accessories(rig)
    // Seated pose disabled — the procedural bend read badly; the character
    // simply holds idle at the seat until a proper sit clip is added.
    // if (rig.hasSkeleton) this._setupSitPose(rig)
    if (this._outfit) this.applyOutfit(this._outfit)
    if (this._pendingBag) this.giveBag(this._pendingBag)
    this.ready = true
  }

  /**
   * Cache the bones we pose while seated and their seated target rotations.
   * The Xbot rig ships no sit clip, so we fake a believable seat by bending the
   * hips + upper legs forward and the knees back a modest amount, bind-relative:
   * each target is `bindQuat · offset`. Angles are kept small and safe — this
   * reads as perching/sitting, not a folded-flat chair pose, and a slightly
   * miscalibrated axis stays a lean rather than an exploded pose.
   * Called once at ready (skeleton rigs only); no per-frame allocation follows.
   *
   * TODO: these angles/signs are a conservative first pass tuned by eye off the
   * spine's rig convention (pitch about local X). If a proper seated clip or a
   * chair prop lands, drive the seat from that instead and deepen the bend.
   */
  _setupSitPose(rig) {
    const b = rig.getBones()
    const X = this._sitAxis
    // bindQuat · axisAngle(X, angle) — a constant seated target per bone.
    const target = (bone, angle) =>
      bone.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, angle))
    this._sitBones = [b.hips, b.leftUpLeg, b.rightUpLeg, b.leftLeg, b.rightLeg]
    this._sitTargets = [
      target(b.hips, -0.15), // torso tips a touch forward over the seat
      target(b.leftUpLeg, -0.5), // thighs swing forward toward horizontal
      target(b.rightUpLeg, -0.5),
      target(b.leftLeg, 0.45), // knees fold back under the seat
      target(b.rightLeg, 0.45),
    ]
  }

  /** Slerp the seated bones toward their targets by the current blend. The
   *  bones already hold this frame's mixer pose, so slerping from there eases
   *  cleanly in/out of the seat with no pop. Zero allocation. */
  _applySit() {
    const bones = this._sitBones
    const targets = this._sitTargets
    const w = this._sitBlend
    for (let i = 0; i < bones.length; i++) bones[i].quaternion.slerp(targets[i], w)
  }

  /** Point the CharacterState the presentation reads (set once by Player). */
  setState(state) {
    this._state = state
    if (this.ready && !this.spine) this.spine = new ProceduralSpine(this._rig, state)
  }

  /**
   * Drive the presentation for one frame.
   * @param dt seconds
   * @param state CharacterState (velocity, heading, angularVelocity, ground)
   * @param collider CapsuleCollider the FootIK probes for the floor
   */
  update(dt, state, collider) {
    if (!this.ready) return
    void collider // Foot IK is off in the world; kept in the signature for later

    const spd = state.horizontalSpeed
    const JOG = 4.5
    const SPRINT = 8.5
    const clamp = THREE.MathUtils.clamp

    // 1-D locomotion blend: idle→walk below JOG, walk→run above it.
    let wi = 0, ww = 0, wr = 0
    if (spd <= JOG) {
      const t = JOG > 0 ? spd / JOG : 0
      wi = 1 - t; ww = t
    } else {
      const t = clamp((spd - JOG) / (SPRINT - JOG), 0, 1)
      ww = 1 - t; wr = t
    }
    // With no idle clip, fold the idle weight into a frozen walk pose so the
    // character stands instead of snapping to the T-pose.
    const idle = this._idle
    if (!idle) { ww += wi; wi = 0 }

    if (idle) idle.setEffectiveWeight(wi)
    if (this._walk) {
      this._walk.setEffectiveWeight(ww)
      const still = spd < 0.2 && !idle
      this._walk.paused = still
      if (still) this._walk.time = 0
      else this._walk.timeScale = clamp(spd / 1.4, 0.6, 2.0)
    }
    if (this._run) {
      this._run.setEffectiveWeight(wr)
      this._run.timeScale = clamp(spd / 3.0, 0.7, 1.8)
    }

    this._rig.update(dt) // advance the mixer with the weights just set
    if (this.spine) this.spine.update(dt) // torso lean on top of the pose

    // Seated override: ease the sit bones in/out on top of the posed skeleton.
    // damp() is framerate-independent and allocation-free; skip entirely once
    // the blend has settled back to standing.
    if (this._sitTargets) {
      const target = this._sitting ? 1 : 0
      this._sitBlend = THREE.MathUtils.damp(this._sitBlend, target, 10, dt)
      if (this._sitBlend > 1e-3) this._applySit()
    }
  }

  // --- game-facing appearance API (kept compatible with procedural Avatar) ---

  setSitting(on) {
    this._sitting = !!on
    // Xbot ships no sit clip. The locomotion blend keeps playing underneath; the
    // per-frame update eases a modest bind-relative seated pose (hips + legs)
    // over the top via `_sitBlend`, so sit/stand read smoothly with no pop.
    // No skeleton (non-Mixamo rig) -> `_sitTargets` is null and this is a no-op.
  }

  applyOutfit(wearable) {
    this._outfit = wearable
    if (!this.material || !wearable) return
    // Single fused mesh: we can't isolate shoes, so a shoe colour tints the
    // whole material's emissive faintly as a nod. Full garment swap needs
    // modular assets this rig doesn't have.
    if (wearable.shoes) {
      const c = new THREE.Color(wearable.shoes)
      this.material.setEmissiveTint(c.getHex(), 0.2)
    }
  }

  giveBag(product) {
    if (!this.ready) {
      this._pendingBag = product || { tint: '#333' }
      this.hasBag = true
      return
    }
    if (this.hasBag && this._bagId) this.accessories.detach(this._bagId)
    const tint = (product && product.tint) || '#3b3b46'
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.42, 0.16),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.7 }),
    )
    bag.castShadow = true
    // On the upper back, hanging slightly behind the spine.
    this._bagId = this.accessories.attach(bag, 'Spine2', { pos: { x: 0, y: 0.05, z: -0.16 } })
    this.hasBag = true
  }
}
