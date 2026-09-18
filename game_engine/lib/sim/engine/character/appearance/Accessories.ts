import * as THREE from 'three'
import type { RiggedAvatar } from './RiggedAvatar'

/**
 * Local transform to bake into an accessory when it is socketed onto a bone.
 *
 * All three fields are optional and expressed in the *bone's* local space — the
 * space the prop inherits once parented. A watch, for example, sits a few
 * centimetres up the forearm and rotated to lie flat against it, which is a
 * fixed local offset, not a world transform.
 */
export interface IAttachOffset {
  /** Local position relative to the bone origin, in metres. Defaults to 0,0,0. */
  pos?: { x: number; y: number; z: number }
  /** Local rotation as intrinsic XYZ Euler angles, in radians. Defaults to identity. */
  rot?: { x: number; y: number; z: number }
  /** Local scale — a uniform factor, or a per-axis vector. Defaults to 1. */
  scale?: number | { x: number; y: number; z: number }
}

/** One live socketing: which prop is parented under which bone. */
interface IAttachment {
  readonly bone: THREE.Bone
  readonly object: THREE.Object3D
}

/**
 * POUNCE Engine — Accessories
 *
 * Sockets arbitrary props (hats, bags, glasses, a torch) onto named bones of a
 * rigged avatar so they ride the animation for free.
 *
 * HOW IT FOLLOWS THE ANIMATION AT ZERO PER-FRAME COST
 * A bone is a `THREE.Object3D` whose world matrix the `AnimationMixer` already
 * recomputes every frame. Parenting a prop *under* that bone means the prop's
 * world matrix is the product of the bone's animated matrix and the prop's fixed
 * local offset — resolved by three.js's normal scene-graph update, which runs
 * regardless. There is therefore no `update()` here and nothing to tick: attach
 * once, and the skeleton drives the prop until it is detached. This class holds
 * only the bookkeeping needed to *undo* an attachment later.
 *
 * BONE NAME RESOLUTION
 * Callers pass friendly, `RIG_GROUND_TRUTH`-style names (`'Head'`, `'LeftHand'`,
 * `'head'`). The GLB, however, stores Mixamo bones with a `mixamorig:` prefix
 * that `GLTFLoader` sanitises (the `:` is stripped) into e.g. `mixamorigHead`.
 * `RiggedAvatar.getBone()` keys on those raw sanitised names, so we expand each
 * request into the small set of plausible raw spellings and take the first that
 * resolves — no dependence on the loader's exact sanitisation rule.
 */
export class Accessories {
  /** id → attachment, so `detach(id)` and `clear()` can find what to unparent. */
  private readonly attachments = new Map<string, IAttachment>()

  /** Monotonic id source. Never reused, so a stale id can never alias a new prop. */
  private nextId = 0

  /**
   * @param avatar A loaded `RiggedAvatar`. We resolve bones through its
   *               `getBone()` accessor and never reach past it into the skeleton.
   */
  constructor(private readonly avatar: RiggedAvatar) {}

  /**
   * Socket `object` onto the bone named `boneName`, applying an optional fixed
   * local `offset`, and return an id to later `detach()` it by.
   *
   * The prop is reparented (removed from any previous parent) onto the bone, so
   * the same object is never double-linked into the graph.
   *
   * @param object   The prop to attach. Its local transform is overwritten by
   *                 `offset` (or reset to identity where `offset` omits a field),
   *                 because the socket transform is authoritative.
   * @param boneName A `RIG_GROUND_TRUTH` bone name — e.g. `'Head'`, `'LeftHand'`.
   * @param offset   Optional local pos/rot/scale to seat the prop in the socket.
   * @returns        An opaque attachment id.
   * @throws         If no bone matching `boneName` exists on the rig — a silent
   *                 miss would leave the prop dangling at the world origin, which
   *                 is far harder to diagnose than a thrown name.
   */
  attach(object: THREE.Object3D, boneName: string, offset?: IAttachOffset): string {
    const bone = this.resolveBone(boneName)
    if (!bone) throw new Error(`Accessories: bone "${boneName}" not found on rig`)

    // Seat the prop. Every component is written explicitly so a reused object
    // carries no residue from a prior socket.
    if (offset?.pos) object.position.set(offset.pos.x, offset.pos.y, offset.pos.z)
    else object.position.set(0, 0, 0)

    if (offset?.rot) object.rotation.set(offset.rot.x, offset.rot.y, offset.rot.z)
    else object.rotation.set(0, 0, 0)

    if (offset?.scale === undefined) object.scale.set(1, 1, 1)
    else if (typeof offset.scale === 'number') object.scale.setScalar(offset.scale)
    else object.scale.set(offset.scale.x, offset.scale.y, offset.scale.z)

    // `add` reparents: three.js removes the object from any current parent first,
    // so re-attaching an already-socketed prop moves rather than duplicates it.
    bone.add(object)

    const id = `acc_${this.nextId++}`
    this.attachments.set(id, { bone, object })
    return id
  }

  /**
   * Remove the prop registered under `id` from its bone. Unknown or
   * already-detached ids are ignored, so double-detach is safe. The prop object
   * itself is not disposed — ownership of its geometry/material stays with the
   * caller, who may re-attach it elsewhere.
   */
  detach(id: string): void {
    const attachment = this.attachments.get(id)
    if (!attachment) return
    attachment.bone.remove(attachment.object)
    this.attachments.delete(id)
  }

  /** Detach every prop this instance has socketed. Leaves the objects intact. */
  clear(): void {
    for (const { bone, object } of this.attachments.values()) bone.remove(object)
    this.attachments.clear()
  }

  /**
   * Resolve a friendly bone name to an actual rig `Bone`.
   *
   * `RiggedAvatar.getBone()` keys on the loader-sanitised raw name, which for a
   * Mixamo rig is `mixamorig` + the PascalCase bone (`mixamorigLeftHand`). We try
   * the request verbatim first (covers non-Mixamo rigs and already-raw names),
   * then the PascalCased base, then the same three prefix spellings the loader
   * might emit. First hit wins; `undefined` if none resolve.
   */
  private resolveBone(boneName: string): THREE.Bone | undefined {
    const pascal = boneName.length > 0 ? boneName[0]!.toUpperCase() + boneName.slice(1) : boneName
    const candidates = [
      boneName,
      pascal,
      `mixamorig${pascal}`,
      `mixamorig:${pascal}`,
      `mixamorig_${pascal}`,
    ]
    for (const name of candidates) {
      const bone = this.avatar.getBone(name)
      if (bone) return bone
    }
    return undefined
  }
}
