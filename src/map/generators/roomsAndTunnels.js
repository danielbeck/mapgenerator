import { TILE } from '../tiles.js'
import { createMapData, setTile } from '../mapData.js'
import { placeEndpoints } from '../placeEndpoints.js'

export const meta = {
    id: 'rooms-tunnels',
    label: 'Rooms & Tunnels',
    description: 'Mostly-rectangular rooms connected by narrow tunnels',
}

export function generate(width, height, rng, complexity = 0.5) {
    const map = createMapData(width, height)
    map.type = meta.id
    // All tiles start as WALL; we carve into them.

    const rooms = placeRooms(width, height, rng, complexity)
    rooms.forEach((room) => carveRoom(map, room, rng, complexity))
    connectRooms(map, rooms, rng, complexity)
    placeEndpoints(map, rng)
    return map
}

// ---------------------------------------------------------------------------
// Room placement
// ---------------------------------------------------------------------------

function placeRooms(width, height, rng, complexity) {
    const rooms = []
    // complexity 0→1: 8–40 rooms
    const TARGET = Math.round(8 + complexity * 32)
    // complexity 0→1: padding 6→1 (tighter packing at high complexity)
    const PAD = Math.round(6 - complexity * 5)
    // complexity 0→1: rooms shrink from large+few to small+many
    const maxRoomW = Math.round(20 - complexity * 10)  // 20→10
    const maxRoomH = Math.round(16 - complexity * 8)   // 16→8
    const minRoomW = Math.round(10 - complexity * 6)   // 10→4
    const minRoomH = Math.round(8 - complexity * 4)   // 8→4

    for (let attempt = 0; attempt < 500 && rooms.length < TARGET; attempt++) {
        const w = minRoomW + Math.floor(rng() * (maxRoomW - minRoomW + 1))
        const h = minRoomH + Math.floor(rng() * (maxRoomH - minRoomH + 1))
        const x = 1 + Math.floor(rng() * (width - w - 2))
        const y = 1 + Math.floor(rng() * (height - h - 2))
        const candidate = { x, y, w, h }
        if (!rooms.some((r) => rectsOverlap(r, candidate, PAD))) {
            rooms.push(candidate)
        }
    }
    return rooms
}

function rectsOverlap(a, b, pad) {
    return (
        a.x - pad < b.x + b.w &&
        a.x + a.w + pad > b.x &&
        a.y - pad < b.y + b.h &&
        a.y + a.h + pad > b.y
    )
}

// ---------------------------------------------------------------------------
// Room carving — mostly rectangular, with optional clipped corners
// ---------------------------------------------------------------------------

function carveRoom(map, room, rng, complexity) {
    const { x, y, w, h } = room

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            setTile(map, x + dx, y + dy, TILE.OPEN)
        }
    }

    // At higher complexity, clip corners more often and more aggressively
    const clipChance = complexity * 0.7
    if (w > 4 && h > 3 && rng() < clipChance) {
        const corner = Math.floor(rng() * 4) // 0=TL 1=TR 2=BL 3=BR
        const clipW = 1 + Math.floor(rng() * 2)
        const clipH = 1 + Math.floor(rng() * 2)
        const cx = corner & 1 ? x + w - clipW : x
        const cy = corner & 2 ? y + h - clipH : y
        for (let dy = 0; dy < clipH; dy++) {
            for (let dx = 0; dx < clipW; dx++) {
                setTile(map, cx + dx, cy + dy, TILE.WALL)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Prim's MST — connects every room with 1-tile-wide L-shaped tunnels
// ---------------------------------------------------------------------------

function roomCenter(room) {
    return {
        x: Math.floor(room.x + room.w / 2),
        y: Math.floor(room.y + room.h / 2),
    }
}

function connectRooms(map, rooms, rng, complexity) {
    if (rooms.length < 2) return

    // complexity 0→1: tunnel width 5→1 (wider at low complexity)
    function tunnelWidth() {
        const max = Math.round(5 - complexity * 4)  // 5→1
        return 1 + Math.floor(rng() * max)
    }

    const connected = new Set([0])

    while (connected.size < rooms.length) {
        let bestDist = Infinity
        let bestFrom = -1
        let bestTo = -1

        for (const from of connected) {
            const a = roomCenter(rooms[from])
            for (let to = 0; to < rooms.length; to++) {
                if (connected.has(to)) continue
                const b = roomCenter(rooms[to])
                const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
                if (dist < bestDist) {
                    bestDist = dist
                    bestFrom = from
                    bestTo = to
                }
            }
        }

        connected.add(bestTo)
        carveTunnel(map, roomCenter(rooms[bestFrom]), roomCenter(rooms[bestTo]), rng, tunnelWidth())
    }

    // At higher complexity add extra cross-connections, creating loops
    const extraConnections = Math.floor(complexity * rooms.length * 0.4)
    for (let i = 0; i < extraConnections; i++) {
        const ai = Math.floor(rng() * rooms.length)
        const bi = Math.floor(rng() * rooms.length)
        if (ai !== bi) {
            carveTunnel(map, roomCenter(rooms[ai]), roomCenter(rooms[bi]), rng, tunnelWidth())
        }
    }
}

function carveTunnel(map, a, b, rng, width = 1) {
    // L-shaped: horizontal leg then vertical, or vice-versa
    if (rng() < 0.5) {
        carveH(map, a.y, a.x, b.x, width)
        carveV(map, b.x, a.y, b.y, width)
    } else {
        carveV(map, a.x, a.y, b.y, width)
        carveH(map, b.y, a.x, b.x, width)
    }
}

function carveH(map, y, x1, x2, width = 1) {
    const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1]
    const half = Math.floor(width / 2)
    for (let x = lo; x <= hi; x++) {
        for (let o = -half; o < width - half; o++) {
            const ty = y + o
            if (x >= 0 && x < map.width && ty >= 0 && ty < map.height) {
                setTile(map, x, ty, TILE.OPEN)
            }
        }
    }
}

function carveV(map, x, y1, y2, width = 1) {
    const [lo, hi] = y1 < y2 ? [y1, y2] : [y2, y1]
    const half = Math.floor(width / 2)
    for (let y = lo; y <= hi; y++) {
        for (let o = -half; o < width - half; o++) {
            const tx = x + o
            if (tx >= 0 && tx < map.width && y >= 0 && y < map.height) {
                setTile(map, tx, y, TILE.OPEN)
            }
        }
    }
}
