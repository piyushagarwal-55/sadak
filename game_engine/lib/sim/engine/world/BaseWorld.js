import * as THREE from 'three'
import { Zones } from './LegacyZones.js'

// A World owns its own THREE.Scene (background, fog, lights), plus flat lists the
// engine consumes: colliders (XZ AABBs), interactables (proximity + E), clickable
// product meshes, NPCs, and smart mirrors.
export class BaseWorld {
  constructor(game) {
    this.game = game
    this.key = 'base'
    this.title = 'World'
    this.scene = new THREE.Scene()
    this.colliders = [] // {minX,maxX,minZ,maxZ,h}  h = height, used for camera occlusion
    // Where anyone may legally stand or drive. Colliders say "you hit a thing";
    // zones say "this ground is not yours". Interiors leave it empty, which
    // makes every surface walkable by default.
    this.zones = new Zones()
    this.interactables = [] // {pos:()=>({x,z}), radius, label, action(game), when?()}
    this.clickables = [] // meshes/groups with userData.product set
    this.npcs = []
    this.employees = [] // uniformed staff with goal-directed movement
    this.mirrors = []
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }
    this.camDist = 6
    this.featuredProduct = null
    // IBL opt-in: 'none' | 'outdoor' | 'interior' | 'studio'. Worlds with a
    // hand-authored light rig should leave this as 'none' — see core/Renderer.js.
    this.envKind = 'none'
  }

  addCollider(minX, maxX, minZ, maxZ, h = 3) {
    this.colliders.push({ minX, maxX, minZ, maxZ, h })
  }

  colliderFromObject(obj, h = 3) {
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    this.colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, h })
  }

  addInteractable(it) {
    this.interactables.push(it)
    return it
  }

  addNPC(npc) {
    this.npcs.push(npc)
    this.scene.add(npc.group)
    this.addInteractable({
      pos: () => ({ x: npc.group.position.x, z: npc.group.position.z }),
      radius: 2.4,
      label: `Talk to ${npc.name} (E)`,
      action: (game) => game.talkTo(npc),
    })
    return npc
  }

  addEmployee(emp) {
    this.employees.push(emp)
    this.scene.add(emp.group)
    this.addInteractable({
      pos: () => ({ x: emp.group.position.x, z: emp.group.position.z }),
      radius: 2.4,
      label: `Talk to ${emp.name} (E)`,
      action: (game) => game.talkTo(emp),
    })
    return emp
  }

  registerClickable(obj, product) {
    obj.traverse((o) => (o.userData.product = product))
    obj.userData.product = product
    this.clickables.push(obj)
  }

  // tag: 'entry' (walked in through the door) — worlds may support more tags
  spawn() {
    return { x: 0, z: 0, heading: Math.PI, camYaw: 0 }
  }

  // Distance LOD for the crowd. A character is ~15 meshes plus a name-tag
  // sprite, so 22 of them dominate the draw budget. Beyond CULL they are hidden
  // and their AI is skipped entirely; between TAG and CULL they still walk but
  // lose the name tag and update at half rate.
  update(dt) {
    const p = this.game.player.pos
    const CULL2 = 44 * 44
    const TAG2 = 18 * 18
    this._npcTick = !this._npcTick

    for (const n of this.npcs) {
      const dx = n.group.position.x - p.x
      const dz = n.group.position.z - p.z
      const d2 = dx * dx + dz * dz

      if (d2 > CULL2) {
        n.group.visible = false
        continue
      }
      n.group.visible = true
      n.avatar.nameTag.visible = d2 < TAG2

      if (d2 > TAG2) {
        // far but visible — step the simulation at half rate with double dt so
        // walking speed stays correct
        if (this._npcTick) n.update(dt * 2, this)
      } else {
        n.update(dt, this)
      }
    }

    // uniformed staff are always active (few of them, all near the player)
    for (const e of this.employees) e.update(dt, this, this.game)
  }
}
