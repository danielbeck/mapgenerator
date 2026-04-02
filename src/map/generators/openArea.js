import { TILE } from '../tiles.js'
import { createMapData, setTile } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'open-area',
    label: 'Open Area',
    description: 'A relatively open area with small obstacle walls scattered about',
}

export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id

    // Fill entirely with open floor
    map.tiles.fill(TILE.OPEN)

    // complexity 0→1 scales cluster count (×0.3 – ×2.5) and max cluster size
    const countScale = 0.3 + complexity * 2.2
    const clusterCount = Math.round((width * height) / 300 * countScale)
    const maxW = 2 + Math.round(complexity * 6)  // 2–8
    const maxH = 2 + Math.round(complexity * 5)  // 2–7

    for (let i = 0; i < clusterCount; i++) {
        const w = 2 + Math.floor(rng() * (maxW - 1))
        const h = 2 + Math.floor(rng() * (maxH - 1))
        const ox = 1 + Math.floor(rng() * (width - w - 1))
        const oy = 1 + Math.floor(rng() * (height - h - 1))
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                setTile(map, ox + dx, oy + dy, TILE.WALL)
            }
        }
    }

    placeEndpoints(map, rng)
    return map
}
