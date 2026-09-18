import * as THREE from 'three'

/**
 * ERRAND MARKERS — where you are meant to go.
 *
 * The same idea as the shipped game's task corona, and for the same reason: a
 * flat ring on the ground goes edge-on to the camera and disappears from twenty
 * metres, which is exactly the distance at which a player needs to be told
 * where to walk. A column of light does not.
 *
 * Rebuilt here rather than imported from `lib/game/engine.ts` for two reasons.
 * That column is 4.2 m tall, and the gali is roofed with tarpaulin at 3.5 m —
 * it would stand straight through the ceiling. And importing it would pull the
 * whole shipped street engine into the `/play` bundle for sixty lines of
 * geometry.
 *
 * Additive blending is what sells it: the column brightens whatever is behind
 * it rather than dimming it, so it reads as light rather than as a coloured
 * plastic tube.
 */

/** Vertical fade, bright at the base. One canvas, shared by every marker. */
let RAMP = null

function ramp() {
  if (RAMP) return RAMP
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 64, 0, 0)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2, 64)
  RAMP = new THREE.CanvasTexture(canvas)
  return RAMP
}

/** Tall enough to be seen down the gali, short enough to clear the tarps. */
const HEIGHT = 2.6

/**
 * @param {number} colour
 * @returns {THREE.Group} with `userData.parts` for `setMarkerState`
 */
export function makeMarker(colour) {
  const g = new THREE.Group()
  const map = ramp()

  // Two nested open cylinders — inner bright and narrow, outer wide and faint —
  // fake the soft radial falloff of a volumetric beam for two draw calls.
  const column = (radius, opacity) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, HEIGHT, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: colour,
        map,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      })
    )
    mesh.position.y = HEIGHT / 2
    return mesh
  }

  const inner = column(0.45, 0.5)
  const outer = column(0.72, 0.2)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.9, 24),
    new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06

  g.add(inner, outer, ring)
  g.userData.parts = { inner, outer, ring }
  g.userData.base = { inner: 0.5, outer: 0.2, ring: 0.65 }
  return g
}

/**
 * Breathes, so it reads as live rather than as a decal.
 *
 * Slow — a fast pulse in the corner of the eye is the single most irritating
 * thing a HUD can do, and this one sits in the middle of the street.
 */
export function updateMarker(marker, t) {
  const { parts, base } = marker.userData
  if (!parts) return
  const k = 0.82 + 0.18 * Math.sin(t * 1.6)
  parts.inner.material.opacity = base.inner * k
  parts.outer.material.opacity = base.outer * k
  parts.ring.material.opacity = base.ring * k
  parts.ring.rotation.z = t * 0.25
}

/**
 * Colours the marker for what the errand is currently worth.
 *
 * `next` is the errand to do now; `later` is one that has unlocked but is not
 * the nearest thing; `done` fades almost out rather than vanishing, so the
 * player can see where they have been.
 */
export function setMarkerState(marker, state) {
  const { parts, base } = marker.userData
  if (!parts) return
  const scale = state === 'next' ? 1 : state === 'later' ? 0.45 : 0.12
  base.inner = 0.5 * scale
  base.outer = 0.2 * scale
  base.ring = 0.65 * scale
  marker.visible = state !== 'hidden'
}

/**
 * Errand colours, matched to the shipped game's vocabulary so the two halves of
 * the product do not disagree about what yellow means.
 */
export const MARKER_COLOURS = {
  buy: 0xf5c518,
  ask: 0x3498db,
  done: 0x4ade80,
}
