/**
 * Mulberry32 seeded PRNG.
 * Returns a function that produces uniform floats in [0, 1).
 */
export function seededRng(seed) {
    let s = seed >>> 0
    return function () {
        s += 0x6d2b79f5
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
