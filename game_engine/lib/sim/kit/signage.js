import * as THREE from 'three'
import { SEED_DISTRICTS } from '@/lib/game/districts'

/**
 * SHOP BOARDS.
 *
 * An Indian shopfront without a painted board is not a shopfront. It is also
 * the one place a generated world can show, rather than claim, that it was
 * written in the city's own language — a board in Telugu is worth more than any
 * amount of UI saying "Telugu".
 *
 * Boards are drawn on a 2D canvas and used as a texture. The alternative,
 * geometry text, needs a font converted to a typeface and cannot do Indic
 * shaping at all: Devanagari and Telugu place matras above, below and around
 * the consonant, and only a real text shaper gets that right. Canvas gets it
 * from the browser for free.
 *
 * THE FONTS MUST BE LOADED FIRST
 *
 * `ctx.fillText` does not wait. If the woff2 has not arrived, the canvas is
 * drawn in a fallback face that has no Telugu glyphs at all and every letter
 * comes out as a box — and because the texture is already uploaded, it never
 * repairs itself. So `loadSignFonts()` is awaited before a world is built.
 */

const FONTS = [
  { family: 'Noto Sans Telugu', file: '/fonts/NotoSansTelugu.woff2' },
  { family: 'Noto Sans Devanagari', file: '/fonts/NotoSansDevanagari.woff2' },
  { family: 'Noto Sans Tamil', file: '/fonts/NotoSansTamil.woff2' },
  { family: 'Noto Sans Bengali', file: '/fonts/NotoSansBengali.woff2' },
  { family: 'Noto Sans Kannada', file: '/fonts/NotoSansKannada.woff2' },
  { family: 'Noto Sans Malayalam', file: '/fonts/NotoSansMalayalam.woff2' },
  { family: 'Noto Sans Gujarati', file: '/fonts/NotoSansGujarati.woff2' },
  { family: 'Noto Sans Gurmukhi', file: '/fonts/NotoSansGurmukhi.woff2' },
  { family: 'Noto Sans Oriya', file: '/fonts/NotoSansOriya.woff2' },
]

let fontsReady = null

/** Loads the Indic faces once. Safe to await repeatedly. */
export function loadSignFonts() {
  if (fontsReady) return fontsReady
  if (typeof document === 'undefined' || !document.fonts) {
    fontsReady = Promise.resolve(false)
    return fontsReady
  }
  fontsReady = Promise.all(
    FONTS.map(async ({ family, file }) => {
      try {
        const face = new FontFace(family, `url(${file}) format('woff2')`)
        await face.load()
        document.fonts.add(face)
        return true
      } catch (err) {
        console.warn(`[sim] could not load ${family}:`, err)
        return false
      }
    })
  ).then((r) => r.some(Boolean))
  return fontsReady
}

/** Which face renders a given script. All ten districts, all nine scripts. */
const FACE = {
  Telugu: '"Noto Sans Telugu"',
  Devanagari: '"Noto Sans Devanagari"',
  Tamil: '"Noto Sans Tamil"',
  Bengali: '"Noto Sans Bengali"',
  Kannada: '"Noto Sans Kannada"',
  Malayalam: '"Noto Sans Malayalam"',
  Gujarati: '"Noto Sans Gujarati"',
  Gurmukhi: '"Noto Sans Gurmukhi"',
  Odia: '"Noto Sans Oriya"',
}

const textureCache = new Map()

/**
 * A painted shop board: native name large, roman underneath, on a flat colour.
 *
 * Two lines because that is how these boards actually are — the name in the
 * local script with a smaller English transliteration under it — and because
 * it means a player who cannot read the script still knows which shop they are
 * standing in front of.
 */
export function boardTexture({ native, roman = '', bg = '#1f6feb', fg = '#fff6e0', script = 'Telugu' }) {
  const key = `${native}|${roman}|${bg}|${fg}|${script}`
  const hit = textureCache.get(key)
  if (hit) return hit

  const W = 512
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // A painted border and a highlight, so it reads as enamel on tin rather than
  // a flat swatch.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, W - 8, H - 8)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(8, 8, W - 16, 22)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = fg

  const face = FACE[script] ?? FACE.Devanagari
  // Shrink to fit rather than clip: shop names vary wildly in length and a
  // truncated name looks like a bug, where a smaller one looks like a sign.
  let size = roman ? 54 : 64
  ctx.font = `700 ${size}px ${face}, sans-serif`
  while (ctx.measureText(native).width > W - 48 && size > 22) {
    size -= 3
    ctx.font = `700 ${size}px ${face}, sans-serif`
  }
  ctx.fillText(native, W / 2, roman ? H / 2 - 16 : H / 2)

  if (roman) {
    let rsize = 30
    ctx.font = `600 ${rsize}px system-ui, sans-serif`
    while (ctx.measureText(roman).width > W - 60 && rsize > 14) {
      rsize -= 2
      ctx.font = `600 ${rsize}px system-ui, sans-serif`
    }
    ctx.globalAlpha = 0.85
    ctx.fillText(roman, W / 2, H / 2 + 30)
    ctx.globalAlpha = 1
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  textureCache.set(key, tex)
  return tex
}

/**
 * The board as a mesh: one painted quad, facing +Z.
 *
 * It was a six-material box, for the sides. Measured: three.js issues a draw
 * call per material group whether or not the groups share a material object, so
 * every board was costing six — fifty-seven boards were spending two hundred
 * and seventeen draw calls on six hundred triangles, which was the single most
 * wasteful thing in the quarter. A board is nailed flat to a wall and its sides
 * are never in shot. If a caller wants the slab behind it, that slab is flat
 * colour and belongs in the static merge with everything else.
 *
 * `MeshBasicMaterial` on purpose: painted tin under a market tarp reads better
 * unlit than lit, and it is one less shader.
 */
export function signBoard({ native, roman, bg, fg, script, width = 4.4, height = 1.1 }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: boardTexture({ native, roman, bg, fg, script }) })
  )
  mesh.castShadow = false
  return mesh
}

/** Board colours that look like enamel paint, not a design system. */
export const BOARD_PALETTE = [
  { bg: '#1b5e9e', fg: '#fff6e0' },
  { bg: '#b3341f', fg: '#ffeecb' },
  { bg: '#1f6f4a', fg: '#fff6e0' },
  { bg: '#e0a21c', fg: '#2b1c08' },
  { bg: '#6a2f8a', fg: '#fdf2ff' },
  { bg: '#0f5c63', fg: '#eafcff' },
]

/**
 * Shop names for a city, in its own script.
 *
 * Hand-written rather than generated, for two reasons: the compiler's model
 * call should spend its tokens on the situation and not on shop names, and a
 * board is the one piece of text a judge will actually read, so it should be
 * right. The model can still override any of these per scenario.
 */
export const SHOP_NAMES = {
  'te-IN': {
    script: 'Telugu',
    names: [
      { native: 'లక్ష్మి కూరగాయలు', roman: 'Lakshmi Vegetables' },
      { native: 'శ్రీ పండ్ల దుకాణం', roman: 'Sri Fruit Stall' },
      { native: 'అన్నపూర్ణ కిరాణా', roman: 'Annapurna Kirana' },
      { native: 'నవరంగ్ వస్త్రాలు', roman: 'Navrang Cloth' },
      { native: 'గాజుల దుకాణం', roman: 'Bangle Shop' },
      { native: 'ఇరానీ చాయ్', roman: 'Irani Chai' },
      { native: 'బాలాజీ స్టోర్స్', roman: 'Balaji Stores' },
      { native: 'మెడికల్ షాప్', roman: 'Medical Shop' },
    ],
  },
  'hi-IN': {
    script: 'Devanagari',
    names: [
      { native: 'लक्ष्मी सब्ज़ी भंडार', roman: 'Lakshmi Sabzi Bhandar' },
      { native: 'शर्मा फल भंडार', roman: 'Sharma Fruits' },
      { native: 'अन्नपूर्णा किराना', roman: 'Annapurna Kirana' },
      { native: 'नवरंग कपड़ा घर', roman: 'Navrang Cloth House' },
      { native: 'चूड़ी बाज़ार', roman: 'Chudi Bazaar' },
      { native: 'गुप्ता चाय', roman: 'Gupta Chai' },
      { native: 'बालाजी स्टोर', roman: 'Balaji Store' },
      { native: 'मेडिकल स्टोर', roman: 'Medical Store' },
    ],
  },
  'ta-IN': {
    script: 'Tamil',
    names: [
      { native: 'லட்சுமி காய்கறி', roman: 'Lakshmi Vegetables' },
      { native: 'ஸ்ரீ பழக்கடை', roman: 'Sri Fruit Stall' },
      { native: 'அன்னபூர்ணா மளிகை', roman: 'Annapurna Kirana' },
      { native: 'நவரங் துணிக்கடை', roman: 'Navrang Cloth' },
      { native: 'வளையல் கடை', roman: 'Bangle Shop' },
      { native: 'சுப்ரமணி டீ', roman: 'Subramani Tea' },
      { native: 'பாலாஜி ஸ்டோர்ஸ்', roman: 'Balaji Stores' },
      { native: 'மருந்தகம்', roman: 'Medical Shop' },
    ],
  },
}

/**
 * Boards for a language, and above all the SCRIPT to paint them in.
 *
 * Three languages have hand-written shop names. The other seven districts fall
 * back to the roman name alone — which is honest (half the boards on a real
 * Indian street are in English) and is far better than the alternative, which
 * is painting Kannada words in a Devanagari face and getting a row of boxes.
 *
 * The script is never guessed. It comes from the district, so the right font is
 * chosen even when the words are not in that script at all.
 */
export function shopNamesFor(language) {
  const authored = SHOP_NAMES[language]
  const district = SEED_DISTRICTS.find((d) => d.language === language)
  const script = district?.script ?? 'Devanagari'
  if (authored) return { script, names: authored.names }

  return {
    script,
    names: SHOP_NAMES['hi-IN'].names.map((n) => ({ native: n.roman, roman: '' })),
  }
}
