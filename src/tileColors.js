import { TILE_COLOR } from './map/tiles.js'

export { TILE_COLOR }

export const FOG_COLOR = '#0d0b09'

function brighten(hex, f) {
    const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f))
    const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f))
    const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f))
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexBlend(hexTile, hexFog, tileFrac) {
    const fr = parseInt(hexFog.slice(1, 3), 16)
    const fg = parseInt(hexFog.slice(3, 5), 16)
    const fb = parseInt(hexFog.slice(5, 7), 16)
    const tr = parseInt(hexTile.slice(1, 3), 16)
    const tg = parseInt(hexTile.slice(3, 5), 16)
    const tb = parseInt(hexTile.slice(5, 7), 16)
    const r = Math.round(fr + (tr - fr) * tileFrac)
    const g = Math.round(fg + (tg - fg) * tileFrac)
    const b = Math.round(fb + (tb - fb) * tileFrac)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// Currently visible — brightened version of the tile colour
export const TILE_COLOR_BRIGHT = TILE_COLOR.map(c => brighten(c, 1.7))

// Unexplored tiles — faint tint blended toward fog (shows layout to the user, not the character)
export const TILE_COLOR_FOG = TILE_COLOR.map(c => hexBlend(c, FOG_COLOR, 0.18))
