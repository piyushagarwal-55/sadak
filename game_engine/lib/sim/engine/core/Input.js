export class Input {
  constructor() {
    this.keys = new Set()
    window.addEventListener('keydown', (e) => { if (!e.repeat) this.keys.add(e.code) })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  down(code) { return this.keys.has(code) }

  axis() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0)
    const z = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0)
    return { x, z }
  }

  get running() { return this.down('ShiftLeft') || this.down('ShiftRight') }
}
