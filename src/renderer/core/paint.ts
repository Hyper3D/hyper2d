/// <reference path="../prefix.d.ts" />

import {
    BasePaint,
    SolidPaint,
    GradientInterpolation,
    GradientSpread,
    LinearGradientPaint,
    RadialGradientPaint,
    StrokeGradientPaint,
    StrokeGradientDirection
} from "../frontend/paint";

import { ShaderDataBuilder } from "./data";
import { globalGradientEncoder } from "./gradient";

// Sync these with Paint.glsl
export const enum PaintCoordinateSpace
{
    Local = 1,
    Global,
    Stroke
}

// Sync these with Paint.glsl
export const enum PaintType
{
    Solid = 0,
    LinearGradient,
    RadialGradient,
    Texture
}

/** Indices for paint descriptor fields */
const enum PaintDescFields
{
    PaintMatrix = 0,
    PaintType = 6,
    PaintCoordinateSpace = 7,
    PaintParameters = 8
}

export class PaintCompiler
{
    private map: WeakMap<BasePaint, CompiledPaint>;

    constructor(private gl: WebGLRenderingContext)
    {
        this.map = new WeakMap<BasePaint, CompiledPaint>();
    }

    compile(paint: BasePaint): CompiledPaint
    {
        let compiled = this.map.get(paint);
        if (!compiled) {
            this.map.set(paint, compiled = new CompiledPaint(paint));
        }
        return compiled;
    }
}

export class CompiledPaint
{
    data: Float32Array;
    texture: WebGLTexture;

    private extraData: Float32Array;

    constructor(paint: BasePaint)
    {
        this.extraData = null;

        const data = this.data = new Float32Array(12);

        if (paint instanceof SolidPaint) {
            data[PaintDescFields.PaintType] =
                PaintType.Solid;
            data[PaintDescFields.PaintCoordinateSpace] =
                PaintCoordinateSpace.Local;

            const color = paint.color;
            data[PaintDescFields.PaintParameters] = color.r;
            data[PaintDescFields.PaintParameters + 1] = color.g;
            data[PaintDescFields.PaintParameters + 2] = color.b;
            data[PaintDescFields.PaintParameters + 3] = color.a;
        } else if (paint instanceof LinearGradientPaint) {
            const {start, end} = paint;
            let dx = end.x - start.x, dy = end.y - start.y;
            const sq = 1 / (dx * dx + dy * dy);
            dx *= sq; dy *= sq;
            data[PaintDescFields.PaintType] =
                PaintType.LinearGradient;
            data[PaintDescFields.PaintCoordinateSpace] =
                PaintCoordinateSpace.Local;
            data[PaintDescFields.PaintParameters] = paint.spread;
            data[PaintDescFields.PaintParameters + 1] = paint.interpol;
            data[PaintDescFields.PaintMatrix] = dx;
            data[PaintDescFields.PaintMatrix + 2] = dy;
            data[PaintDescFields.PaintMatrix + 4] = -(dx * start.x + dy * start.y);
            this.extraData = globalGradientEncoder.encode(paint);
        } else if (paint instanceof RadialGradientPaint) {
            const {start, end} = paint;
            let dx = end.x - start.x, dy = end.y - start.y;
            const sq = 1 / Math.sqrt(dx * dx + dy * dy);
            data[PaintDescFields.PaintType] =
                PaintType.RadialGradient;
            data[PaintDescFields.PaintCoordinateSpace] =
                PaintCoordinateSpace.Local;
            data[PaintDescFields.PaintParameters] = paint.spread;
            data[PaintDescFields.PaintParameters + 1] = paint.interpol;
            data[PaintDescFields.PaintMatrix] = sq;
            data[PaintDescFields.PaintMatrix + 3] = sq;
            data[PaintDescFields.PaintMatrix + 4] = -sq * start.x;
            data[PaintDescFields.PaintMatrix + 5] = -sq * start.y;
            this.extraData = globalGradientEncoder.encode(paint);
        } else if (paint instanceof StrokeGradientPaint) {
            data[PaintDescFields.PaintType] =
                PaintType.LinearGradient;
            data[PaintDescFields.PaintCoordinateSpace] =
                PaintCoordinateSpace.Stroke;
            data[PaintDescFields.PaintParameters] = paint.spread;
            data[PaintDescFields.PaintParameters + 1] = paint.interpol;
            switch (paint.direction) {
                case StrokeGradientDirection.Along:
                    data[PaintDescFields.PaintMatrix] = 1;
                    break;
                case StrokeGradientDirection.Across:
                    data[PaintDescFields.PaintMatrix + 2] = 1;
                    break;
                default:
                    throw new Error("bad StrokeGradientDirection");
            }
            this.extraData = globalGradientEncoder.encode(paint);
        } else {
            throw new Error("Unsupported paint type was specified.");
        }
    }

    prepare(dataBuilder: ShaderDataBuilder): void
    {
        if (this.extraData) {
            const idx = dataBuilder.allocate(this.extraData.length >> 2);
            dataBuilder.data.set(this.extraData, idx);
            this.data[PaintDescFields.PaintParameters + 3] = idx >> 2;
        }
    }
}

