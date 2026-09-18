// ============================================================================
// Campus — live product feed from Campus Shoes (campusshoes.com) over the real
// UCP `search_catalog`, proxied server-side (vite.config.js → /api/products).
// Real titles, real prices, real photos, real sizes. Cached in-memory.
// ============================================================================

let _cache = null
let _inflight = null

// Slot a live Campus title into one of the store's shopping categories so the
// sales associate can present & discuss it in the normal flow.
function inferSection(title = '') {
  const t = title.toLowerCase()
  if (/basket|court|hoop/.test(t)) return 'Basketball'
  if (/formal|derby|brogue|oxford|office/.test(t)) return 'Formal'
  if (/trek|trail|hik|outdoor|boot/.test(t)) return 'Outdoor'
  if (/casual|sneaker|loafer|slip|canvas|lifestyle/.test(t)) return 'Casual Sneakers'
  return 'Running' // Campus is a sports brand — running is the safe default
}

export async function fetchCampusProducts(query = 'shoes', limit = 8) {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = fetch(`/api/products?q=${encodeURIComponent(query)}&limit=${limit}`)
    .then((r) => r.json())
    .then((data) => {
      const products = (data.products || []).map((p) => ({
        ...p,
        live: true,
        section: inferSection(p.title),
        kind: 'campus',
        tint: '#e11d48',
        name: p.title,
      }))
      _cache = products
      return products
    })
    .catch(() => {
      _cache = []
      return []
    })
    .finally(() => {
      _inflight = null
    })
  return _inflight
}

// Route a Shopify CDN image through our same-origin proxy so WebGL textures
// never taint (and CORS is never an issue).
export function proxiedImage(url) {
  if (!url) return null
  return `/api/img?u=${encodeURIComponent(url)}`
}

export const formatINR = (n) => '₹' + Number(n).toLocaleString('en-IN')
