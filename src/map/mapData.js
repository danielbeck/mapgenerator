import { TILE } from './tiles.js'

/**
 * Create a blank MapData object. All tiles initialised to WALL.
 *
 * MapData shape:
 *   { width, height, tiles: Uint8Array, type: string|null,
 *     entrance: {x,y}|null, exit: {x,y}|null }
 */
export function createMapData(width, height) {
    return {
        width,
        height,
        tiles: new Uint8Array(width * height).fill(TILE.WALL),
        type: null,
        entrance: null,
        exit: null,
    }
}

export function getTile(map, x, y) {
    return map.tiles[y * map.width + x]
}

export function setTile(map, x, y, value) {
    map.tiles[y * map.width + x] = value
}

export function isInBounds(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height
}

/** Return all {x, y} positions whose tile matches tileType. */
export function findTiles(map, tileType) {
    const result = []
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.tiles[y * map.width + x] === tileType) result.push({ x, y })
        }
    }
    return result
}

/**
 * Flood-fill the largest connected region of non-WALL tiles and wall off
 * everything else. Guarantees a single connected open area.
 */
export function floodKeepLargest(map) {
    const n = map.tiles.length
    const visited = new Uint8Array(n)
    const dirs = [1, -1, map.width, -map.width]

    let bestStart = -1
    let bestSize = 0

    for (let seed = 0; seed < n; seed++) {
        if (map.tiles[seed] === TILE.WALL || visited[seed]) continue
        const queue = [seed]
        visited[seed] = 1
        let head = 0
        while (head < queue.length) {
            const idx = queue[head++]
            for (const d of dirs) {
                const nb = idx + d
                if (nb < 0 || nb >= n) continue
                if (d === 1 && idx % map.width === map.width - 1) continue
                if (d === -1 && idx % map.width === 0) continue
                if (visited[nb] || map.tiles[nb] === TILE.WALL) continue
                visited[nb] = 1
                queue.push(nb)
            }
        }
        if (queue.length > bestSize) {
            bestSize = queue.length
            bestStart = seed
        }
    }

    if (bestStart === -1) return

    const keep = new Uint8Array(n)
    const queue = [bestStart]
    keep[bestStart] = 1
    let head = 0
    while (head < queue.length) {
        const idx = queue[head++]
        for (const d of dirs) {
            const nb = idx + d
            if (nb < 0 || nb >= n) continue
            if (d === 1 && idx % map.width === map.width - 1) continue
            if (d === -1 && idx % map.width === 0) continue
            if (keep[nb] || map.tiles[nb] === TILE.WALL) continue
            keep[nb] = 1
            queue.push(nb)
        }
    }

    for (let i = 0; i < n; i++) {
        if (map.tiles[i] !== TILE.WALL && !keep[i]) map.tiles[i] = TILE.WALL
    }
}
