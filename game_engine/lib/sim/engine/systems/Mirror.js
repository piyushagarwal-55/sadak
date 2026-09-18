import * as THREE from 'three'

// "Smart mirror": a wall screen showing a live secondary-camera view of the player.
// Rendered to a WebGLRenderTarget each frame while the player is nearby.
export class Mirror {
  constructor({ x, z, y = 1.7, rotY = 0, w = 2.0, h = 2.8 }) {
    this.rt = new THREE.WebGLRenderTarget(320, 420)
    this.rt.texture.colorSpace = THREE.SRGBColorSpace
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 40)
    this._skip = 0

    this.group = new THREE.Group()
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.08),
      new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4, metalness: 0.5 })
    )
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.rt.texture }))
    screen.position.z = 0.05
    this.group.add(frame, screen)
    this.group.position.set(x, y, z)
    this.group.rotation.y = rotY
    this._wp = new THREE.Vector3()
  }

  addTo(world) {
    world.scene.add(this.group)
    world.mirrors.push(this)
  }

  update(renderer, scene, player) {
    this.group.getWorldPosition(this._wp)
    if (this._wp.distanceTo(player.pos) > 8) return
    // only refresh every 3rd frame — the mirror doesn't need 60fps
    if (this._skip-- > 0) return
    this._skip = 2
    // camera looks out from the mirror toward the player
    const fx = Math.sin(this.group.rotation.y)
    const fz = Math.cos(this.group.rotation.y)
    this.camera.position.set(this._wp.x + fx * 0.1, 1.6, this._wp.z + fz * 0.1)
    this.camera.lookAt(player.pos.x, 1.1, player.pos.z)
    renderer.setRenderTarget(this.rt)
    renderer.render(scene, this.camera)
    renderer.setRenderTarget(null)
  }
}
