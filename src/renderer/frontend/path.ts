
import {
    Vector2Like,
    vector2Pool,
    Vector2
} from "../utils/geometry";

import {
    StrokeStyle,
    StrokeCapStyle,
    StrokeJoinStyle
} from "./stroke";

import {
    computeBoundingBoxForBezier2,
    computeBoundingBoxForBezier3,
    computeBoundingBoxForEllipticArc,
    evaluateLineSegment,
    evaluateLineSegmentDerivative,
    evaluateBezier2,
    evaluateBezier2Derivative,
    evaluateBezier3,
    evaluateBezier3Derivative,
    evaluateEllipticArc,
    evaluateEllipticArcDerivative
} from "../utils/advgeometry";

export enum PathUsage
{
    Static,
    Dynamic
}

export const enum PathPointType
{
    /**
     * Closes the current path by drawing a straight line from the
     * current position to the start point.
     * This is optional. If this exists, this must be the last component.
     * <pre>
     *  (no parameters)
     * </pre>
     */
    ClosePath = 0,

    /**
     * Draws a straight line toward the end point specified by a pair of numbers.
     * <pre>
     *  [1]: endX
     *  [2]: endY
     * </pre>
     */
    Line,

    /**
     * Draws a quadratic bezier curve from the current position using
     * control points specified by two pairs of numbers.
     * <pre>
     *  [1]: x2
     *  [2]: y3
     *  [3]: endX
     *  [4]: endY
     * </pre>
     */
    Bezier2,

    /**
     * Draws a cubic bezier curve from the current position using
     * control points specified by three pairs of numbers.
     * <pre>
     *  [1]: x2
     *  [2]: y2
     *  [3]: x3
     *  [4]: y3
     *  [5]: endX
     *  [6]: endY
     * </pre>
     */
    Bezier3,

    /**
     * Draws an elliptic arc with following parameters:
     * 1. A pair of numbers that specifies the center of the ellipse.
     * 2. The X-axis/Y-axis radii of the ellipse.
     * 3. Rotation angle (CW in radians).
     * 4. The angle at which the arc starts (measured CW from +X axis, in radians).
     * 5. The angle at which the arc ends (measured CW from +X axis, in radians).
     * 6. A pair of numbers that specifies the end position.
     * The start point must match the current position.
     *
     * <pre>
     *  [1]: cx
     *  [2]: cy
     *  [3]: rx
     *  [4]: ry
     *  [5]: angle
     *  [6]: startAngle
     *  [7]: endAngle
     *  [8]: endX
     *  [9]: endY
     * </pre>
     */
    EllipticArc
}

export class Path
{
    public subpaths: Subpath[];

    constructor(
        data: number[][],
        public usage: PathUsage)
    {
        this.subpaths = data.filter((cb) => cb.length > 3).map((d) => new Subpath(d));
        Object.freeze(this);
    }

    /**
     * @param strokeStyle Stroke style, or null (for bounding box of the fill).
     * @param outMin The top-left coordinate of the bounding box, which is updated
     *        every time new points outside the current AABB were found.
     * @param outMax The bottom-right coordinate of the bounding box, which is updated
     *        every time new points outside the current AABB were found.
     */
    computeBoundingBox(strokeStyle: StrokeStyle,
        outMin: Vector2Like, outMax: Vector2Like): void
    {
        for (const subpath of this.subpaths) {
            subpath.computeBoundingBox(strokeStyle, outMin, outMax);
        }
    }
}

export class Subpath
{
    public data: Float64Array;

    constructor(
        data: number[])
    {
        this.data = new Float64Array(data);
        Object.freeze(this);
    }

    /**
     * @param strokeStyle Stroke style, or null (for bounding box of the fill).
     * @param outMin The top-left coordinate of the bounding box, which is updated
     *        every time new points outside the current AABB were found.
     * @param outMax The bottom-right coordinate of the bounding box, which is updated
     *        every time new points outside the current AABB were found.
     */
    computeBoundingBox(strokeStyle: StrokeStyle,
        outMin: Vector2Like, outMax: Vector2Like): void
    {
        const tv1 = vector2Pool.get();
        const tv2 = vector2Pool.get();
        const tv3 = vector2Pool.get();
        const tv4 = vector2Pool.get();

        let i = 2;
        const d = this.data;

        // Depending on the joining angle, miter join might be so big
        const shouldConsiderJoin = strokeStyle &&
            strokeStyle.joinStyle == StrokeJoinStyle.Miter;

        const cosLimit = shouldConsiderJoin ? 
            2 / (strokeStyle.miterLimit * strokeStyle.miterLimit) - 1 : 0;

        const strokeWidth = strokeStyle ?
            strokeStyle.width : 0;

        while (true) {
            this.computeCapBoundingBox(strokeStyle,
                d[i - 2], d[i - 1], outMin, outMax);

            if (shouldConsiderJoin) {
                this.evaluateDerivative(i, 1, tv1);
                tv1.normalize();
            }

            switch (<PathPointType> d[i]) {
                case PathPointType.Line:
                    i += 3;
                    break;
                case PathPointType.Bezier2:
                    computeBoundingBoxForBezier2(d[i - 2], d[i - 1],
                        d[i + 1], d[i + 2],
                        d[i + 3], d[i + 4],
                        tv3, tv4);

                    outMin.x = Math.min(outMin.x, tv3.x - strokeWidth);
                    outMin.y = Math.min(outMin.y, tv3.y - strokeWidth);
                    outMax.x = Math.max(outMax.x, tv4.x + strokeWidth);
                    outMax.y = Math.max(outMax.y, tv4.y + strokeWidth);

                    i += 5;
                    break;
                case PathPointType.Bezier3:
                    computeBoundingBoxForBezier3(d[i - 2], d[i - 1],
                        d[i + 1], d[i + 2],
                        d[i + 3], d[i + 4],
                        d[i + 5], d[i + 6],
                        tv3, tv4);

                    outMin.x = Math.min(outMin.x, tv3.x - strokeWidth);
                    outMin.y = Math.min(outMin.y, tv3.y - strokeWidth);
                    outMax.x = Math.max(outMax.x, tv4.x + strokeWidth);
                    outMax.y = Math.max(outMax.y, tv4.y + strokeWidth);

                    i += 7;
                    break;
                case PathPointType.EllipticArc:
                    computeBoundingBoxForEllipticArc(d[i + 1], d[i + 2],
                        d[i + 3], d[i + 4], d[i + 5], d[i + 6], d[i + 7],
                        tv3, tv4);

                    outMin.x = Math.min(outMin.x, tv3.x - strokeWidth);
                    outMin.y = Math.min(outMin.y, tv3.y - strokeWidth);
                    outMax.x = Math.max(outMax.x, tv4.x + strokeWidth);
                    outMax.y = Math.max(outMax.y, tv4.y + strokeWidth);

                    i += 10;
                    break;
                default:
                    throw new Error("bad PathPointType");
            }

            if (i >= d.length) {
                break;
            }

            const lastX = d[i - 2];
            const lastY = d[i - 1];
            let closed = false;
            if (d[i] == PathPointType.ClosePath) {
                // cyclic
                i += 1;
                closed = true;
            }

            if (shouldConsiderJoin) {
                this.evaluateDerivative(i == d.length ? 2 : i, 0, tv2);
                tv2.normalize();

                // join angle
                const dot = tv1.dotVector(tv2);

                if (dot > cosLimit) {
                    // miter join is used.
                    const curl = tv1.x * tv2.y - tv1.y * tv2.x;
                    // find the outer point
                    tv1.addVector(tv2);
                    if (curl > 0)
                        tv1.set(tv1.y, -tv1.x);
                    else
                        tv1.set(-tv1.y, tv1.x);
                    tv1.scaleByScalar(strokeWidth / tv1.lengthSquared());
                    tv1.add(lastX, lastY);
                    outMin.x = Math.min(outMin.x, tv1.x);
                    outMin.y = Math.min(outMin.y, tv1.y);
                    outMax.x = Math.max(outMax.x, tv1.x);
                    outMax.y = Math.max(outMax.y, tv1.y);
                }
            }

            if (closed) {
                break;
            }
        }

        vector2Pool.release(tv1);
        vector2Pool.release(tv2);
        vector2Pool.release(tv3);
        vector2Pool.release(tv4);
    }

    private computeCapBoundingBox(strokeStyle: StrokeStyle,
        x: number, y: number,
        outMin: Vector2Like, outMax: Vector2Like): void
    {
        if (!strokeStyle) {
            outMin.x = Math.min(outMin.x, x);
            outMin.y = Math.min(outMin.y, y);
            outMax.x = Math.max(outMax.x, x);
            outMax.y = Math.max(outMax.y, y);
        } else {
            let rad = strokeStyle.width;
            if (strokeStyle.capStyle == StrokeCapStyle.Square) {
                rad *= Math.SQRT2;
            }
            outMin.x = Math.min(outMin.x, x - rad);
            outMin.y = Math.min(outMin.y, y - rad);
            outMax.x = Math.max(outMax.x, x + rad);
            outMax.y = Math.max(outMax.y, y + rad);
        }
    }

    nextIndexOf(index: number): number
    {
        const d = this.data;

        switch (<PathPointType> d[index]) {
            case PathPointType.Line:
                return index + 3;
            case PathPointType.ClosePath:
                return index + 1;
            case PathPointType.Bezier2:
                return index + 5;
            case PathPointType.Bezier3:
                return index + 7;
            case PathPointType.EllipticArc:
                return index + 10;
            default:
                throw new Error("bad PathPointType");
        }
    }

    evaluatePosition(index: number, t: number, out: Vector2): Vector2
    {
        const d = this.data;

        const x1 = d[index - 2], y1 = d[index - 1];

        if (t <= 0) {
            out.x = x1;
            out.y = y1;
            return;
        }

        switch (<PathPointType> d[index]) {
            case PathPointType.Line: {
                evaluateLineSegment(x1, y1,
                    d[index + 1], d[index + 2], t, out);
                return;
            }
            case PathPointType.ClosePath: {
                evaluateLineSegment(x1, y1,
                    d[0], d[1], t, out);
                return;
            }
            case PathPointType.Bezier2: {
                evaluateBezier2(x1, y1,
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4], t, out);
                return;
            }
            case PathPointType.Bezier3: {
                evaluateBezier3(x1, y1,
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4],
                    d[index + 5], d[index + 6], t, out);
                return;
            }
            case PathPointType.EllipticArc: {
                evaluateEllipticArc(
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4],
                    d[index + 5],
                    d[index + 6], d[index + 7],
                    t, out);
                return;
            }
            default:
                throw new Error("bad PathPointType");
        }
    }

    evaluateDerivative(index: number, t: number, out: Vector2): Vector2
    {
        const d = this.data;

        const x1 = d[index - 2], y1 = d[index - 1];

        switch (<PathPointType> d[index]) {
            case PathPointType.Line: {
                evaluateLineSegmentDerivative(x1, y1,
                    d[index + 1], d[index + 2], out);
                return;
            }
            case PathPointType.ClosePath: {
                evaluateLineSegmentDerivative(x1, y1,
                    d[0], d[1], out);
                return;
            }
            case PathPointType.Bezier2: {
                evaluateBezier2Derivative(x1, y1,
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4], t, out);
                return;
            }
            case PathPointType.Bezier3: {
                evaluateBezier3Derivative(x1, y1,
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4],
                    d[index + 5], d[index + 6], t, out);
                return;
            }
            case PathPointType.EllipticArc: {
                evaluateEllipticArcDerivative(
                    d[index + 1], d[index + 2],
                    d[index + 3], d[index + 4],
                    d[index + 5],
                    d[index + 6], d[index + 7],
                    t, out);
                return;
            }
            default:
                throw new Error("bad PathPointType");
        }
    }
}

export class PathBuilder
{
    private data: number[][];
    private active: boolean;
    private current: number[];

    constructor()
    {
        this.data = [];
        this.current = null;
        this.active = false;
    }

    createPath(usage: PathUsage): Path
    {
        return new Path(this.data, usage);
    }

    private checkActive(): void
    {
        if (this.current == null) {
            throw new Error("no active figure");
        }
    }

    closePath(): void
    {
        this.checkActive();
        this.current.push(PathPointType.ClosePath);
        this.current = null;
    }

    moveTo(x: number, y: number): void
    {
        checkNumber(x);
        checkNumber(y);
        
        this.data.push(this.current = []);
        this.current.push(x);
        this.current.push(y);
    }

    lineTo(x: number, y: number): void
    {
        checkNumber(x);
        checkNumber(y);

        this.checkActive();
        this.current.push(PathPointType.Line);
        this.current.push(x);
        this.current.push(y);
    }

    quadraticCurveTo(x1: number, y1: number, x2: number, y2: number): void
    {
        checkNumber(x1);
        checkNumber(y1);
        checkNumber(x2);
        checkNumber(y2);

        this.checkActive();
        this.current.push(PathPointType.Bezier2);
        this.current.push(x1);
        this.current.push(y1);
        this.current.push(x2);
        this.current.push(y2);
    }

    bezierCurveTo(x1: number, y1: number, x2: number, y2: number,
        x3: number, y3: number): void
    {
        checkNumber(x1);
        checkNumber(y1);
        checkNumber(x2);
        checkNumber(y2);
        checkNumber(x3);
        checkNumber(y3);

        this.checkActive();
        this.current.push(PathPointType.Bezier3);
        this.current.push(x1);
        this.current.push(y1);
        this.current.push(x2);
        this.current.push(y2);
        this.current.push(x3);
        this.current.push(y3);
    }

    arc(x: number, y: number, radius: number, 
        startAngle: number, endAngle: number, anticlockwise?: boolean): void
    {
        checkNumber(x);
        checkNumber(y);
        checkNumber(radius);
        checkNumber(startAngle);
        checkNumber(endAngle);

        const pi2 = Math.PI * 2;
        startAngle -= Math.floor(startAngle / pi2) * pi2;
        endAngle -= Math.floor(endAngle / pi2) * pi2;
        if (anticlockwise) {
            if (endAngle >= startAngle) {
                endAngle -= Math.PI * 2;
            }
        } else {
            if (endAngle <= startAngle) {
                endAngle += Math.PI * 2;
            }
        }

        const sx = x + radius * Math.cos(startAngle);
        const sy = y + radius * Math.sin(startAngle);
        if (this.active) {
            this.lineTo(sx, sy);
        } else {
            this.moveTo(sx, sy);
        }

        this.current.push(PathPointType.EllipticArc);
        this.current.push(x);
        this.current.push(y);
        this.current.push(radius);
        this.current.push(radius);
        this.current.push(0); // angle
        this.current.push(startAngle);
        this.current.push(endAngle);

        const ex = x + radius * Math.cos(endAngle);
        const ey = y + radius * Math.sin(endAngle);
        this.current.push(ex);
        this.current.push(ey);
    }

    ellipse(x: number, y: number, 
        radiusX: number, radiusY: number,
        rotation: number,
        startAngle: number, endAngle: number, 
        anticlockwise?: boolean): void
    {
        checkNumber(x);
        checkNumber(y);
        checkNumber(radiusX);
        checkNumber(radiusY);
        checkNumber(rotation);
        checkNumber(startAngle);
        checkNumber(endAngle);

        const pi2 = Math.PI * 2;
        startAngle -= Math.floor(startAngle / pi2) * pi2;
        endAngle -= Math.floor(endAngle / pi2) * pi2;
        if (anticlockwise) {
            if (endAngle >= startAngle) {
                endAngle -= Math.PI * 2;
            }
        } else {
            if (endAngle <= startAngle) {
                endAngle += Math.PI * 2;
            }
        }

        const rCos = Math.cos(rotation), rSin = Math.sin(rotation);

        let lx = Math.cos(startAngle) * radiusX;
        let ly = Math.sin(startAngle) * radiusY;
    
        const sx = lx * rCos - ly * rSin + x;
        const sy = lx * rSin + ly * rCos + y;

        if (this.active) {
            this.lineTo(sx, sy);
        } else {
            this.moveTo(sx, sy);
        }

        this.current.push(PathPointType.EllipticArc);
        this.current.push(x);
        this.current.push(y);
        this.current.push(radiusX);
        this.current.push(radiusY);
        this.current.push(rotation);
        this.current.push(startAngle);
        this.current.push(endAngle);

        lx = Math.cos(endAngle) * radiusX;
        ly = Math.sin(endAngle) * radiusY;
    
        const ex = lx * rCos - ly * rSin + x;
        const ey = lx * rSin + ly * rCos + y;
        this.current.push(ex);
        this.current.push(ey);
    }

}

function checkNumber(num: number): void
{
    if (!isFinite(num)) {
        throw new Error("bad number");
    }
}
