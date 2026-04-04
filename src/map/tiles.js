/**
 * Tile type constants and their display colours.
 * Add new tile types here as the game expands.
 */
export const TILE = Object.freeze({
    WALL: 0,
    OPEN: 1,
    ENTRANCE: 2,
    EXIT: 3,
})

// Indexed by TILE value for fast lookup
export const TILE_COLOR = [
    '#1e1612', // WALL     — dark stone
    '#4a3c2e', // OPEN     — stone floor
    '#22cc66', // ENTRANCE — green
    '#ffffff', // EXIT     — white
]
