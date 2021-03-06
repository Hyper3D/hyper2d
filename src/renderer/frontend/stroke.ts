
import { IDisposable } from "../utils/types";
import { Signal } from "../utils/signal";

export enum StrokeJoinStyle
{
    Round = 1,
    Miter,
    Bevel,
    // FIXME: MiterClip, Arcs (SVG2)
}

export enum StrokeCapStyle
{
    Round = 1,
    Flat,
    Square
}

export class StrokeStyle
{
    onDisposed: Signal<void>;

    /**
     * @param width Width of the line.
     * @param joinStyle Join style.
     * @param capStyle Specifies the appearance of the stroke cap.
     * @param miterLimit Miter limit, measured from the inside of the join to its outside point.
     */
    constructor(
        public width: number,
        public joinStyle: StrokeJoinStyle,
        public capStyle: StrokeCapStyle,
        public miterLimit: number)
    {
        this.onDisposed = new Signal<void>();

        Object.freeze(this);
    }

    dispose(): void 
    {
        this.onDisposed.invoke(this, null);
    }
}
