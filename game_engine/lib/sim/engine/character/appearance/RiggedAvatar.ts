import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Load a rig from GLB/GLTF (the shipping format) or, if a `.fbx` is requested,
 * lazily pull in FBXLoader so it stays out of the default bundle. Returns a
 * scene root plus the clips, so `load()` treats both formats identically.
 */
async function loadModel(url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  if (/\.fbx$/i.test(url)) {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const group = await new FBXLoader().loadAsync(url)
    // Mixamo FBX is authored in centimetres (~100× too big); height
    // normalization rescales anyway, but shrink here so the pre-scale bounding
    // box math stays in a sane range.
    group.scale.setScalar(0.01)
    group.updateMatrixWorld(true)
    return { scene: group, animations: group.animations ?? [] }
  }
  const gltf = await new GLTFLoader().loadAsync(url)
  return { scene: gltf.scene, animations: gltf.animations ?? [] }
}

/**
 * POUNCE Engine — RiggedAvatar
 *
 * The visual, skinned character: loads the Xbot GLB, owns its skeleton and
 * `AnimationMixer`, and exposes the two things the animation/IK tier needs —
 * named bones (for procedural rotation) and named clip actions (for blending).
 *
 * It is the linchpin under `animation/*` and `ik/*`: every one of those systems
 * asks this class for a bone or a clip. It holds no movement or game state; it
 * is a rig plus an accessor surface. `MovementController` drives the capsule,
 * the capsule's transform is copied onto `group`, and this class makes the mesh
 * that hangs off it move like a person.
 *
 * See `src/character/RIG_GROUND_TRUTH.md` for the exact bone and clip names.
 */

/** Bone names that the procedural systems reach for, resolved once at load. */
export interface IRigBones {
  hips: THREE.Bone
  spine: THREE.Bone
  spine1: THREE.Bone
  spine2: THREE.Bone
  neck: THREE.Bone
  head: THREE.Bone
  leftUpLeg: THREE.Bone
  leftLeg: THREE.Bone
  leftFoot: THREE.Bone
  rightUpLeg: THREE.Bone
  rightLeg: THREE.Bone
  rightFoot: THREE.Bone
}

// Base bone names without the rig prefix. three.js's GLTFLoader runs node names
// through PropertyBinding.sanitizeNodeName, which rewrites the `:` in Mixamo's
// `mixamorig:Hips` (to `_` or by stripping), so matching the raw string fails.
// We normalize every stored bone to its bare, lower-cased base name and match on
// that, which is stable across the loader's sanitization.
const BONE_LOOKUP: Record<keyof IRigBones, string> = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'spine1',
  spine2: 'spine2',
  neck: 'neck',
  head: 'head',
  leftUpLeg: 'leftupleg',
  leftLeg: 'leftleg',
  leftFoot: 'leftfoot',
  rightUpLeg: 'rightupleg',
  rightLeg: 'rightleg',
  rightFoot: 'rightfoot',
}

/** Strip any `mixamorig` prefix and separators, lower-case, for stable matching. */
function normalizeBoneName(name: string): string {
  return name.replace(/mixamorig/i, '').replace(/[:_\s]/g, '').toLowerCase()
}

export class RiggedAvatar {
  /** The node to parent under the movement capsule / add to the scene. */
  readonly group = new THREE.Group()

  /** Drives all skeletal animation. Advanced once per frame in `update()`. */
  private mixer: THREE.AnimationMixer | null = null

  /** clipName → action, for the animation graph to blend. */
  private readonly actions = new Map<string, THREE.AnimationAction>()

  /** Resolved bone references, for the IK / spine systems. Null until loaded. */
  private bones: IRigBones | null = null

  /** Whether the Mixamo bone set resolved (Foot IK / spine lean available). */
  private _hasSkeleton = false

  /** Every bone by its raw (sanitized) name. */
  private readonly boneByName = new Map<string, THREE.Bone>()

  /** Every bone by its normalized base name, robust to loader renaming. */
  private readonly boneByNormalized = new Map<string, THREE.Bone>()

  /** Standing height in world units after normalization. */
  private _height = 1.8

  /** True once `load()` has resolved. */
  private _ready = false

  /**
   * Load and prepare the rig.
   *
   * @param url          Path to the GLB (served by Vite, e.g. `/models/Xbot.glb`).
   * @param targetHeight World-space height to normalize the model to, so the mesh
   *                     matches the collision capsule regardless of the source
   *                     scale.
   */
  async load(url: string, targetHeight = 1.8): Promise<this> {
    const loaded = await loadModel(url)
    const model = loaded.scene

    // Skinned meshes report a rest-pose bounding box that does not follow the
    // animated skeleton, so frustum culling wrongly hides them at some angles.
    // Disable it and enable shadows.
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.frustumCulled = false
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
      const bone = o as THREE.Bone
      if (bone.isBone) {
        this.boneByName.set(bone.name, bone)
        this.boneByNormalized.set(normalizeBoneName(bone.name), bone)
      }
    })

    // Normalize height, feet on the group origin. Measure the rest pose, scale
    // uniformly to the target, then lift so the lowest point sits at y=0.
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const scale = size.y > 1e-4 ? targetHeight / size.y : 1
    model.scale.setScalar(scale)
    const box2 = new THREE.Box3().setFromObject(model)
    model.position.y -= box2.min.y
    this._height = targetHeight

    this.group.add(model)

    // Resolve the typed Mixamo bone set. Non-Mixamo rigs (CesiumMan) simply
    // won't have these — that's fine: we record hasSkeleton = false and the
    // caller skips the bone-driven systems (Foot IK, spine lean) rather than
    // crashing. getBones() still throws if called without a skeleton.
    let hasSkeleton = true
    const resolved = {} as IRigBones
    for (const key of Object.keys(BONE_LOOKUP) as (keyof IRigBones)[]) {
      const bone = this.boneByNormalized.get(BONE_LOOKUP[key])
      if (!bone) {
        hasSkeleton = false
        break
      }
      resolved[key] = bone
    }
    this.bones = hasSkeleton ? resolved : null
    this._hasSkeleton = hasSkeleton

    // Wire the mixer and cache one action per clip.
    this.mixer = new THREE.AnimationMixer(model)
    for (const clip of loaded.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip))
    }

    this._ready = true
    return this
  }

  get ready(): boolean {
    return this._ready
  }

  get height(): number {
    return this._height
  }

  /** True when the Mixamo bone set resolved — i.e. Foot IK / spine lean are
   *  safe to run. False for non-Mixamo rigs (they animate, just without the
   *  bone-driven systems). */
  get hasSkeleton(): boolean {
    return this._hasSkeleton
  }

  /** The first cached action, for rigs that ship a single (often unnamed) clip
   *  and so can't be driven by the named-clip animation graph. */
  get primaryAction(): THREE.AnimationAction | null {
    for (const action of this.actions.values()) return action
    return null
  }

  /**
   * Load an animation clip from a separate file and bind it to this character
   * under `name`. Mixamo exports one animation per file (each with its own copy
   * of the mesh, which we discard); the clip's tracks are keyed by bone name, so
   * `clipAction` on our mixer binds them to this skeleton as long as the bone
   * names match (they do — every Mixamo export uses `mixamorig:` names).
   *
   * @returns the bound action, or null if the file held no animation.
   */
  async loadClip(name: string, url: string): Promise<THREE.AnimationAction | null> {
    if (!this.mixer) throw new Error('RiggedAvatar: loadClip() before load()')
    const loaded = await loadModel(url)
    const clip = loaded.animations[0]
    if (!clip) return null
    clip.name = name
    const action = this.mixer.clipAction(clip)
    this.actions.set(name, action)
    return action
  }

  /** The resolved bone set. Throws if the rig has no Mixamo skeleton — guard
   *  with `hasSkeleton` first. */
  getBones(): IRigBones {
    if (!this.bones) throw new Error('RiggedAvatar: getBones() on a rig without a Mixamo skeleton')
    return this.bones
  }

  /** Any bone by its raw name, or undefined. */
  getBone(name: string): THREE.Bone | undefined {
    return this.boneByName.get(name)
  }

  /**
   * The action for a clip name, or undefined if absent. Case-insensitive on the
   * fallback so callers can ask for `idle` whether the GLB named the clip `idle`
   * (Xbot) or `Idle` (Soldier). The clip set is tiny, so the linear scan is free.
   */
  getAction(clipName: string): THREE.AnimationAction | undefined {
    const exact = this.actions.get(clipName)
    if (exact) return exact
    const lc = clipName.toLowerCase()
    for (const [name, action] of this.actions) {
      if (name.toLowerCase() === lc) return action
    }
    return undefined
  }

  /** Every clip name present on the rig. */
  get clipNames(): string[] {
    return [...this.actions.keys()]
  }

  /** The mixer, for an animation graph that wants direct control. */
  getMixer(): THREE.AnimationMixer | null {
    return this.mixer
  }

  /**
   * Advance skeletal animation by one frame. The animation graph writes action
   * weights; this flushes them into bone matrices. Must run before any IK pass,
   * which then overwrites specific bones on top of the posed skeleton.
   */
  update(dt: number): void {
    this.mixer?.update(dt)
  }
}
