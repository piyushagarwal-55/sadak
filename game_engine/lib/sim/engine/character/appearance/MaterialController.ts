import * as THREE from 'three'
import type { RiggedAvatar } from './RiggedAvatar'

/**
 * POUNCE Engine — MaterialController
 *
 * The appearance surface for a single rigged avatar's skin. It owns the handful
 * of `MeshStandardMaterial` instances hanging off the rig's `SkinnedMesh`es and
 * exposes a small, intention-revealing API — skin tone, roughness, metalness,
 * emissive tint, opacity — over the raw material fields.
 *
 * WHY CLONE ON CONSTRUCTION
 * `SkeletonUtils.clone()` (how the engine spawns extra copies of one loaded GLB)
 * shares the source materials by reference across every clone. Mutating a shared
 * material would silently recolour every avatar built from the same asset. So at
 * construction we clone each material slot once and reassign it to its mesh:
 * from then on this controller mutates a private material set that belongs to
 * exactly one avatar.
 *
 * WHY THE PROPS MUTATE IN PLACE
 * Every setter writes through to an existing `THREE.Color`/scalar
 * (`color.setHex`, `roughness = v`) rather than constructing new objects. These
 * are not per-frame methods, but the engine's zero-allocation discipline is
 * uniform: an appearance change is a value write, never a heap churn. The
 * underlying GPU uniforms pick the new values up on the next render without a
 * shader recompile — the sole exception is toggling `transparent`, which flips
 * the material's render state and therefore forces one `needsUpdate`.
 *
 * SINGLE RESPONSIBILITY
 * This class touches material fields and nothing else. It does not load, clone
 * the rig, drive animation, or own the mesh graph — it is handed a loaded
 * avatar and adjusts how its surface reflects light.
 */
export class MaterialController {
  /**
   * The avatar's own `MeshStandardMaterial`s, cloned so no other instance shares
   * them. Non-standard materials (e.g. a raw `MeshBasicMaterial`) are cloned to
   * break sharing but omitted here, because the standard-only fields below
   * (`roughness`, `metalness`, `emissiveIntensity`) do not exist on them and a
   * write would be a silent no-op.
   */
  private readonly materials: THREE.MeshStandardMaterial[] = []

  /**
   * @param avatar A loaded `RiggedAvatar`. Its `SkinnedMesh`es live under
   *               `avatar.group`; we walk that subtree once, here, and never
   *               again — the cached list is all any setter needs.
   */
  constructor(avatar: RiggedAvatar) {
    avatar.group.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return

      // A mesh's `material` is either one material or an array (one slot per
      // geometry group). Clone every slot so this avatar's materials are
      // unshared, then keep references to the standard ones for mutation.
      if (Array.isArray(mesh.material)) {
        const cloned = mesh.material.map((m) => m.clone())
        mesh.material = cloned
        for (const m of cloned) this.collect(m)
      } else {
        const cloned = mesh.material.clone()
        mesh.material = cloned
        this.collect(cloned)
      }
    })
  }

  /**
   * Add `material` to the mutable set iff it is a `MeshStandardMaterial`
   * (`MeshPhysicalMaterial`, its subclass, qualifies too). The `isMesh…` brand
   * check is three.js's own duck-type guard and survives minification and
   * duplicate bundled copies of the library, unlike `instanceof`.
   */
  private collect(material: THREE.Material): void {
    if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      this.materials.push(material as THREE.MeshStandardMaterial)
    }
  }

  /**
   * Set the base (albedo) colour — the character's skin/clothing tone.
   *
   * @param hex Packed 0xRRGGBB colour. Interpreted in sRGB, matching how the
   *            GLB's baked textures are authored, so the on-screen result is the
   *            colour you would pick in an image editor.
   */
  setSkinTone(hex: number): void {
    for (const m of this.materials) m.color.setHex(hex)
  }

  /**
   * Set micro-surface roughness. 0 = mirror-smooth, 1 = fully diffuse. Clamped,
   * because a roughness outside [0,1] feeds the BRDF a value it is not defined
   * for and produces specular fireflies under image-based lighting.
   */
  setRoughness(v: number): void {
    const r = clamp01(v)
    for (const m of this.materials) m.roughness = r
  }

  /**
   * Set metalness. 0 = dielectric (skin, cloth), 1 = raw metal. Clamped to
   * [0,1] for the same reason as roughness — the metallic/roughness workflow is
   * only defined on that interval.
   */
  setMetalness(v: number): void {
    const t = clamp01(v)
    for (const m of this.materials) m.metalness = t
  }

  /**
   * Set the self-illumination tint and its strength. The emitted radiance is
   * `emissive * emissiveIntensity`, so a black tint or a zero intensity both
   * disable the glow. Used for highlight/selection states and accents.
   *
   * @param hex       Packed 0xRRGGBB emissive colour, sRGB.
   * @param intensity Non-negative multiplier on the tint. Clamped at 0, since a
   *                  negative intensity would subtract light — physically absurd
   *                  and a source of NaNs downstream.
   */
  setEmissiveTint(hex: number, intensity: number): void {
    const i = intensity > 0 ? intensity : 0
    for (const m of this.materials) {
      m.emissive.setHex(hex)
      m.emissiveIntensity = i
    }
  }

  /**
   * Set overall opacity in [0,1]. Below 1 the material is switched into
   * transparent blending; at exactly 1 it returns to opaque.
   *
   * Toggling `transparent` changes the render state (alpha blend + depth-write),
   * so we raise `needsUpdate` only on the frames the flag actually flips — never
   * on a plain opacity slide, where an unconditional `needsUpdate` would force a
   * pointless shader recompile every call.
   */
  setOpacity(v: number): void {
    const o = clamp01(v)
    const shouldBeTransparent = o < 1
    for (const m of this.materials) {
      m.opacity = o
      if (m.transparent !== shouldBeTransparent) {
        m.transparent = shouldBeTransparent
        m.needsUpdate = true
      }
    }
  }
}

/** Clamp to the closed unit interval. Shared by the physically-bounded setters. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
