
import { Color } from "../utils/color";
import { Vector2, Vector2Like } from "../utils/geometry";
import { unmix } from "../utils/math";

export class BasePaint
{
}

export class SolidPaint extends BasePaint
{
    public color: Color;

    constructor(color: Color)
    {
        super();
        this.color = color.clone();
    }
}

export interface GradientStop
{
    pos: number;
    color: Color;
}

export enum GradientSpread
{
    Pad = 1,
    Reflect,
    Repeat
}

export enum GradientInterpolation
{
    RGB = 1,
    LinearRGB
}

export class GradientPaint extends BasePaint
{
    public stops: GradientStop[];

    constructor(stops: GradientStop[],
        public spread: GradientSpread,
        public interpol: GradientInterpolation)
    {
        super();

        this.stops = stops =
            stops.map((stop, i) => ({ pos: stop.pos, color: stop.color, index: i }))
            .sort((a, b) => {
                if (a.pos > b.pos) {
                    return 1;
                } else if (a.pos < b.pos) {
                    return -1;
                }
                // stablize
                return a.index - b.index;
            });


        if (stops.length == 0) {
            throw new Error("empty gradent");
        }

        // stop count is limited by the shader
        if (stops.length > 200) {
            throw new Error("too complex gradent");
        }

        // remove some kind of redundant points
        let lastPos = stops[stops.length - 1].pos, sameCount = 1;
        for (let i = stops.length - 2; i >= 0; --i) {
            const stp = stops[i];
            if (stp.pos == lastPos) {
                ++sameCount;
                if (sameCount >= 3) {
                    stops.splice(i + 1, 1);
                }
            } else {
                sameCount = 1;
            }
            lastPos = stp.pos;
        }

        // constant optimization
        if (stops.length == 1) {
            const constantColor = stops[0].color;
            stops = [
                { pos: 0, color: constantColor },
                { pos: 1, color: constantColor }
            ];
        }

        // break at t = 0, 1
        while (stops[0].pos < 0 && stops.length > 1) {
            if (stops[1].pos <= 0) {
                stops.shift();
            } else {
                stops[0].color = Color.mix(stops[0].color, stops[1].color,
                    unmix(stops[0].pos, stops[1].pos, 0));
                stops[0].pos = 0;
                break;
            }
        }
        if (stops[0].pos > 0) {
            stops.unshift({
                pos: 0,
                color: stops[0].color
            });
        }
        while (stops[stops.length - 1].pos > 1 && stops.length > 1) {
            if (stops[stops.length - 2].pos >= 1) {
                stops.pop();
            } else {
                stops[stops.length - 1].color =
                    Color.mix(stops[stops.length - 1].color, stops[stops.length - 2].color,
                    unmix(stops[stops.length - 1].pos, stops[stops.length - 2].pos, 1));
                stops[stops.length - 1].pos = 1;
                break;
            }
        }
        if (stops[stops.length - 1].pos < 1) {
            stops.push({
                pos: 1,
                color: stops[stops.length - 1].color
            });
        }
    }
}

export class LinearGradientPaint extends GradientPaint
{
    public start: Vector2;
    public end: Vector2;

    constructor(stops: GradientStop[],
        spread: GradientSpread,
        interpol: GradientInterpolation,
        start: Vector2Like, end: Vector2Like)
    {
        super(stops, spread, interpol);

        this.start = new Vector2().copyFrom(start);
        this.end = new Vector2().copyFrom(end);
    }
}

export class RadialGradientPaint extends GradientPaint
{
    public start: Vector2;
    public end: Vector2;

    constructor(stops: GradientStop[],
        spread: GradientSpread,
        interpol: GradientInterpolation,
        start: Vector2Like, end: Vector2Like)
    {
        super(stops, spread, interpol);

        this.start = new Vector2().copyFrom(start);
        this.end = new Vector2().copyFrom(end);
    }
}

export enum StrokeGradientDirection
{
    Along,
    Across
}

export class StrokeGradientPaint extends GradientPaint {

    constructor(stops: GradientStop[],
        spread: GradientSpread,
        interpol: GradientInterpolation,
        public direction: StrokeGradientDirection) {
        super(stops, spread, interpol);
        // TODO: offset and scale?
    }
}