import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RENDER } from './design.js'

// Renderer, image-based lighting, and post-processing.
//
// The important idea here is buildEnvironment(): RoomEnvironment ships inside
// three.js, so piping it through PMREMGenerator gives every material in every
// scene real reflections and ambient light for ZERO network payload. That is
// what lets this project look premium without abandoning "the whole world is
// generated from code".
// See docs/PRD-v0.2-sole-flagship.md §1.2–§1.3.

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  // Capped at 1.5 rather than 2: on a HiDPI screen a ratio of 2 means every
  // post-processing pass shades 4x the pixels, which was the single biggest
  // cost while moving. 1.5 is visually near-identical at this art style.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = RENDER.exposure
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // The composer renders several passes per frame and each one would reset the
  // counters, leaving the HUD reporting only the final blit. Reset manually,
  // once per frame, so the stats cover the whole frame.
  renderer.info.autoReset = false
  container.appendChild(renderer.domElement)
  return renderer
}

// Generate the IBL cubemap once and share the texture across all worlds.
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const rt = pmrem.fromScene(new RoomEnvironment(), 0.04)
  pmrem.dispose()
  return rt.texture
}

// Apply IBL to a world's scene, if that world opts in.
//
// This is deliberately opt-in. RoomEnvironment is a bright studio interior:
// applying it to every scene floods hand-authored lighting with white ambient
// and flattens it — verified against the neon-dusk plaza, which lost its whole
// mood at intensity 1.0 and was still visibly washed at 0.35.
//
// Worlds authored FOR image-based lighting (metals, glass, polished stone —
// i.e. the SOLE flagship) declare envKind and get the full benefit. Worlds with
// their own tuned rigs declare 'none' and are left exactly as their author
// intended.
export function applyEnvironment(scene, envTexture, kind = 'none') {
  if (kind === 'none') {
    scene.environment = null
    return
  }
  scene.environment = envTexture
  scene.environmentIntensity = RENDER.envIntensity[kind] ?? 1
}

// Bloom is deliberately narrow: a high threshold means only genuinely hot
// surfaces (LED strips, neon signage, effect particles) glow. A low threshold
// would wash the whole scene and read as cheap, not premium.
export function createComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2())
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  composer.setSize(size.x, size.y)

  const renderPass = new RenderPass(scene, camera)
  // Bloom mips are computed at half resolution. UnrealBloomPass runs five mip
  // levels of separable blur — roughly ten fullscreen passes — and halving the
  // working size cuts that cost ~4x for a glow nobody can tell apart.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)),
    RENDER.bloom.strength,
    RENDER.bloom.radius,
    RENDER.bloom.threshold
  )
  composer.addPass(renderPass)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  return { composer, renderPass, bloom }
}

// Frame-time watchdog. Post-processing is the first thing to go on a weak GPU —
// the PRD requires it be auto-disabled rather than tanking the frame budget.
export class QualityGuard {
  constructor({ threshold = 19, samples = 35, onDowngrade } = {}) {
    this.threshold = threshold
    this.samples = samples
    this.onDowngrade = onDowngrade
    this.acc = 0
    this.n = 0
    this.downgraded = false
  }

  sample(dtMs) {
    if (this.downgraded) return
    this.acc += dtMs
    this.n++
    if (this.n < this.samples) return
    const avg = this.acc / this.n
    this.acc = 0
    this.n = 0
    if (avg > this.threshold) {
      this.downgraded = true
      this.onDowngrade?.(avg)
    }
  }
}
