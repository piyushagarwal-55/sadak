import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * STATIC GEOMETRY MERGING.
 *
 * Draw calls, not triangles, are what the demo laptop runs out of. Measured on
 * the first walkable bazaar: every shopfront was twelve separate meshes (recess,
 * glow, ledge, seven goods boxes, awning) and there are about fifty of them, so
 * the shopfronts alone were spending six hundred draw calls — the entire budget,
 * on scenery, before a single shopper was drawn.
 *
 * Nothing in that list ever moves. So it is collected here first and flushed to
 * one mesh per material at the end. The same fifty shopfronts come back as
 * about a dozen draws.
 *
 * The rule for using this: anything that will never move goes in a bucket;
 * anything animated (people, the cow, the festoon) stays its own object.
 */
export class GeoBucket {
  constructor() {
    /** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
    this.byMaterial = new Map()
  }

  /**
   * @param {THREE.BufferGeometry} geometry  consumed; pass a clone if you keep it
   * @param {THREE.Material} material        bucketed by identity, so share them
   * @param {THREE.Matrix4} [matrix]         world transform, baked in
   */
  add(geometry, material, matrix) {
    if (!geometry) return
    const g = matrix ? geometry.clone().applyMatrix4(matrix) : geometry
    const list = this.byMaterial.get(material)
    if (list) list.push(g)
    else this.byMaterial.set(material, [g])
  }

  /** Bakes a box straight in, which is most of what set dressing needs. */
  box(w, h, d, x, y, z, material, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rotY) g.rotateY(rotY)
    g.translate(x, y, z)
    this.add(g, material)
  }

  /**
   * Absorbs an already-built, already-positioned object — the stall builders
   * return groups of merged meshes, and this folds all of them into the same
   * buckets so sixteen stalls cost what one does.
   */
  absorb(object) {
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      if (!child.isMesh) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      // Multi-material meshes carry groups; merging those correctly is more
      // trouble than it saves, so they are left alone by the caller.
      if (mats.length > 1) return
      this.add(child.geometry, mats[0], child.matrixWorld)
    })
  }

  /** Emits one mesh per material into `parent`. Returns how many were made. */
  flush(parent, { castShadow = true, receiveShadow = true } = {}) {
    let made = 0
    for (const [material, geometries] of this.byMaterial) {
      const merged =
        geometries.length > 1 ? BufferGeometryUtils.mergeGeometries(geometries, false) : geometries[0]
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = castShadow
      mesh.receiveShadow = receiveShadow
      parent.add(mesh)
      made++
    }
    this.byMaterial.clear()
    return made
  }
}
