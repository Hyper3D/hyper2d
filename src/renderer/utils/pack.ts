/// <reference path="../prefix.d.ts" />

// JS version of Pack.glsl

// FIXME: i don't think this works
export function unpack16(x: number, y: number): number
{
    return x + y * (1 / 256);
}

export function pack8x2To32f(x: number, y: number): number
{
    return x * (255 / 256) + Math.round(y * 255);
}

export function pack24ToU8(ab: Uint8Array, index: number, value: number): void
{
    value *= 255;
    const i1 = Math.floor(value);
    const f1 = (value - i1) * 255;
    const i2 = Math.floor(f1);
    const f2 = (f1 - i2) * 255;
    ab[index] = Math.max(Math.min(i1, 255), 0);
    ab[index + 1] = i2;
    ab[index + 2] = f2;
}

const invLn2 = 1 / Math.LN2;
const log2 = (<any> Math).log2 ||
    ((v: number) => Math.log(v) * invLn2);

const invExp2Map: number[] = [];
for (let i = 0; i < 128; ++i) {
    invExp2Map.push(Math.pow(2, 63 - i));
}

export function pack32FToU8(ab: Uint8Array, index: number, value: number): void
{
    let absValue = Math.abs(value);
    if (absValue < 1.e-16 || absValue > 1.e+16) {
        // overflow / underflow
        ab[index] = ab[index + 1] = ab[index + 2] = ab[index + 3] = 0;
    } else {
        let exponent = Math.ceil(log2(absValue)) + 63;
        absValue *= invExp2Map[exponent];

        if (value < 0) {
            // negative
            exponent += 128;
        }

        pack24ToU8(ab, index, absValue);
        ab[index + 3] = exponent;
    }
}
