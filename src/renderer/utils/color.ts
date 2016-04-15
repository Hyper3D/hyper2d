import { mix } from "./math";

export class Color implements ColorLike
{
    constructor(
        public r: number,
        public g: number,
        public b: number,
        public a: number)
    {}

    clone(): Color
    {
        return new Color(this.r, this.g, this.b, this.a);
    }

    static fromHex(hex: number): Color
    {
        return new Color(
            (hex & 0xff) / 0xff,
            ((hex >> 8) & 0xff) / 0xff,
            ((hex >> 16) & 0xff) / 0xff,
            (hex >>> 24) / 0xff);
    }

    static mix(a: Color, b: Color, fract: number): Color
    {
        return new Color(
            mix(a.r, b.r, fract),
            mix(a.g, b.g, fract),
            mix(a.b, b.b, fract),
            mix(a.a, b.a, fract)
        );
    }
}

export interface ColorLike
{
    r: number;
    g: number;
    b: number;
    a: number;
}
