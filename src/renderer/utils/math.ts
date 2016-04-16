
export function mix(a: number, b: number, frac: number): number
{
    return a * (1 - frac) + b * frac;
}

export function unmix(a: number, b: number, ref: number): number
{
    return (ref - a) / (b - a);
}

export const cbrt: (x: number) => number = (<any> Math).cbrt || ((x: number) => {
    const y = Math.pow(Math.abs(x), 1 / 3);
    return x < 0 ? -y : y;
});

const imul: (a: number, b: number) => number  = (<any> Math).imul;

const deBruijnTable = [
    0,  9,  1, 10, 13, 21,  2, 29, 11, 14, 16, 18, 22, 25,  3, 30,
    8, 12, 20, 28, 15, 17, 24,  7, 19, 27, 23,  6, 26,  5,  4, 31
];

export const ulog2: (v: number) => number =
    imul ? (v: number) => {
        // have imul; use http://graphics.stanford.edu/~seander/bithacks.html#IntegerLogDeBruijn
        v |= v >>> 1;
        v |= v >>> 2;
        v |= v >>> 4;
        v |= v >>> 8;
        v |= v >>> 16;
        return deBruijnTable[imul(v, 0x07C4ACDD) >>> 27];
    } : (v: number) => {
        let i = 0;
        while (v != 0) {
            ++i;
            v = (v >>> 1);
        }
        return i;
    };

const deBrujinTable2 = [
    0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, 25, 17, 4, 8,
    31, 27, 13, 23, 21, 19, 16, 7, 26, 12, 18, 6, 11, 5, 10, 9
];

export const countTrailingZeroBits: (v: number) => number =
    imul ? (v: number) => {
        // have imul; use http://graphics.stanford.edu/~seander/bithacks.html#ZerosOnRightMultLookup
        return deBrujinTable2[imul(v & -v, 0x077CB531) >>> 27];
    } : (v: number) => {
        let c = 32;
        v &= -v;
        if (v !== 0) --c;
        if (v & 0x0000FFFF) c -= 16;
        if (v & 0x00FF00FF) c -= 8;
        if (v & 0x0F0F0F0F) c -= 4;
        if (v & 0x33333333) c -= 2;
        if (v & 0x55555555) c -= 1;
        return c;
    };

/**
 * Finds all real roots of the cubic equation <code>x^3 + ax^2 + bx + c = 0</code>.
 * @return The number of roots, up to 3.
 */
export function solveCubicRoots(
    a: number, b: number, c: number,
    out: ArrayLike<number>): number
{
    // FIXME: optimize
    const p = b - a * a * (1 / 3);
    const p3 = p * (1 / 3);
    const q = a * (2 * a * a - 9 * b) * (1 / 27) + c;
    const q2 = q * 0.5;
    const D = q2 * q2 + p3 * p3 * p3;
    if (D < 0) {
        // three real roots
        const mp3 = p * (-1 / 3);
        const mp33 = mp3 * mp3 * mp3;
        const r = Math.sqrt(mp33);
        const t = q / (-2 * r);
        const cosphi = Math.max(-1, Math.min(t, 1));
        const phi = Math.acos(cosphi);
        const crtr = cbrt(r);
        const t1 = 2 * crtr;
        out[0] = t1 * Math.cos(phi * (1 / 3)) - a * (1 / 3);
        out[1] = t1 * Math.cos((phi + 2 * Math.PI) * (1 / 3)) - a * (1 / 3);
        out[2] = t1 * Math.cos((phi + 4 * Math.PI) * (1 / 3)) - a * (1 / 3);
        return 3;
    } else if (D === 0) {
        // three real roots, two of which are equal:
        const u1 = cbrt(q2);
        out[0] = 2 * u1 - a * (1 / 3);
        out[1] = -u1 - a * (1 / 3);
        return 2;
    } else {
        // one real root
        const sd = Math.sqrt(D);
        out[0] = cbrt(sd - q2) - cbrt(sd + q2) - a * (1 / 3);
        return 1;
    }
}

/**
 * Finds all real roots of the equation <code>ax^3 + bx^2 + cx + d = 0</code>.
 * @return The number of roots, up to 3.
 */
export function solveAtMostCubicRoots(
    a: number, b: number, c: number, d: number,
    out: ArrayLike<number>): number
{
    if (a !== 0) {
        // cubic equation
        b /= a; c /= a; d /= a;
        return solveCubicRoots(b, c, d, out);
    } else if (b !== 0) {
        // quadratic equation
        const D = c * c - 4 * b * d;
        const ia = -0.5 / a;
        if (D > 0) {
            const dd = Math.sqrt(D);
            out[0] = (c + dd) * ia;
            out[1] = (c - dd) * ia;
            return 2;
        } else if (D === 0) {
            out[0] = ia * c;
            return 1;
        } else {
            return 0;
        }
    } else if (c !== 0) {
        // linear equation cx + d = 0
        out[0] = -d / c;
        return 1;
    } else if (d !== 0) {
        // x == 0, x != 0
        return 0;
    } else {
        // 0 == 0
        out[0] = 0;
        return 1;
    }
}