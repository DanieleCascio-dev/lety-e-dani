/**
 * Estrae lat/lng da URL Google Maps comuni (nessuna chiamata di rete).
 * Restituisce null se non trova coordinate attendibili.
 */
export function parseGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
  const s = String(url ?? '').trim()
  if (!s) return null

  // @lat,lng nelle path (es. .../@45.406435,11.8767868,17z)
  const atMatch = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (atMatch) {
    const lat = Number(atMatch[1])
    const lng = Number(atMatch[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  // ?q=45.4,11.8 o &q=...
  const qMatch = s.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (qMatch) {
    const lat = Number(qMatch[1])
    const lng = Number(qMatch[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  // path /45.406435,-11.876786 (alcuni link)
  const slashCoord = s.match(/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?|\/|$)/)
  if (slashCoord) {
    const lat = Number(slashCoord[1])
    const lng = Number(slashCoord[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  // pattern 3dLAT!4dLNG (embed / place)
  const d34 = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (d34) {
    const lat = Number(d34[1])
    const lng = Number(d34[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  // center=lat%2Clng
  const centerMatch = s.match(/center=(-?\d+(?:\.\d+)?)[,%2C]+(-?\d+(?:\.\d+)?)/i)
  if (centerMatch) {
    const lat = Number(centerMatch[1])
    const lng = Number(centerMatch[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  return null
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}
