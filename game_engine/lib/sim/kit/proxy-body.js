import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { setWalkPhase } from '@/lib/game/people'

/**
 * DISTANT BODIES.
 *
 * Measured on the bazaar: a `makePerson` rig is 2,500 triangles but FOURTEEN
 * meshes — a torso, a head, hair, and ten limb pieces, each its own object
 * because each rotates. Thirty-four of them is four hundred and seventy draw
 * calls, which on the demo laptop's Intel UHD is most of the frame. And the
 * market wants more people in it, not fewer.
 *
 * The rig cannot be merged, because merging destroys the hierarchy the gait
 * animates. But at twenty metres, on a 1080p screen, under a tarp, nobody can
 * see a gait. What reads at that distance is the silhouette and the fact that
 * it is moving across the ground.
 *
 * So a distant body is baked: every mesh flattened into one geometry, each
 * one's material colour written into vertex colours so a single shared material
 * covers all of them. One mesh. ONE draw call, and the same material object
 * across the whole crowd.
 *
 * TWO FRAMES, NOT ONE
 *
 * A frozen body sliding across the ground looks broken in a way a low-detail
 * one does not. So two poses are baked, opposite points of the same stride, and
 * swapped a few times a second. It is a two-frame flipbook — how crowds were
 * animated before skinning was affordable — and it costs nothing, because only
 * one of the two is ever visible.
 */

/** Shared by every proxy in the world, so they can never split a draw call. */
let SHARED_MATERIAL = null

function sharedMaterial() {
  if (!SHARED_MATERIAL) {
    SHARED_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true })
    SHARED_MATERIAL.name = 'crowd_proxy'
  }
  return SHARED_MATERIAL
}

/**
 * Flattens a posed rig into one geometry.
 *
 * Only position, normal and colour survive. UVs are dropped deliberately:
 * `mergeGeometries` refuses a set whose attributes differ, the rig's pieces are
 * inconsistent about having them, and nothing here is textured anyway.
 */
function bake(root) {
  root.updateMatrixWorld(true)
  const pieces = []

  root.traverse((mesh) => {
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material) return

    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    if (!g.attributes.normal) g.computeVertexNormals()

    // The shared material is white, so the vertex colour has to carry the
    // whole thing. `material.color` is already in linear space, which is what
    // the colour attribute is read as.
    const c = material.color ?? new THREE.Color(0xffffff)
    const n = g.attributes.position.count
    const colours = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colours[i * 3] = c.r
      colours[i * 3 + 1] = c.g
      colours[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    pieces.push(g)
  })

  if (!pieces.length) return null
  const merged = pieces.length > 1 ? BufferGeometryUtils.mergeGeometries(pieces, false) : pieces[0]
  for (const g of pieces) if (g !== merged) g.dispose()
  return merged
}

/**
 * Bakes a proxy from a rig the caller already has.
 *
 * It takes the live rig rather than building its own, because `makePerson` is
 * the single most expensive thing in a world build and calling it twice per
 * body doubled the time the loading bar sat there. The rig is re-posed while
 * baking and then handed back — harmless, since the next frame poses it again.
 *
 * The rig must be UNSCALED when this is called: the bake reads world matrices,
 * so a scaled root would be baked in and then scaled a second time by the
 * holder. Scale both afterwards.
 *
 * `pose: 'walk'` bakes two frames; `pose: 'stand'` bakes one, for the people
 * who never go anywhere — a shopkeeper flipping between two stride poses at
 * distance would look like he was marching on the spot.
 *
 * @param {THREE.Group} rig a `makePerson` group, at scale 1
 * @param {{pose?: 'walk'|'stand'}} [opts]
 * @returns {THREE.Group} with `userData.frames` — drive it with `setProxyFrame`
 */
export function makeProxyBody(rig, { pose = 'walk' } = {}) {
  // Opposite points of one stride: left leg forward, then right. Anything
  // closer together and the flip reads as a twitch rather than a step.
  const phases = pose === 'stand' ? [0] : [Math.PI * 0.5, Math.PI * 1.5]
  const frames = []
  for (const phase of phases) {
    setWalkPhase(rig, phase, pose === 'stand' ? 0 : 1, 0, 0)
    const geometry = bake(rig)
    if (geometry) frames.push(geometry)
  }

  const holder = new THREE.Group()
  holder.name = `proxy_${rig.name}`
  holder.userData.frames = frames.map((g, i) => {
    const mesh = new THREE.Mesh(g, sharedMaterial())
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.visible = i === 0
    holder.add(mesh)
    return mesh
  })
  return holder
}

/** Shows frame 0 or 1. Anything else is ignored. */
export function setProxyFrame(holder, index) {
  const frames = holder.userData.frames
  if (!frames) return
  const want = index & 1
  if (frames[0].visible === (want === 0)) return
  frames[0].visible = want === 0
  if (frames[1]) frames[1].visible = want === 1
}

export function disposeProxy(holder) {
  for (const mesh of holder.userData.frames ?? []) mesh.geometry.dispose()
}
