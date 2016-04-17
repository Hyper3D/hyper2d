
import {
    Path,
    Subpath,
    PathPointType,
    PathUsage
} from "../frontend/path";

import {
    StrokeStyle,
    StrokeCapStyle,
    StrokeJoinStyle
} from "../frontend/stroke";

import {
    mix,
    solveAtMostCubicRoots
} from "../utils/math";

import {
    Vector2,
    vector2Pool
} from "../utils/geometry";

import {
    computeLengthOfBezier2,
    evaluateBezier2Derivative,
    computeMaximumCurvatureOfBezier2
} from "../utils/advgeometry";

import {
    BufferBuilder
} from "../utils/bufferbuilder";

import { evalWithoutContext } from "../utils/eval";

import {
    ShaderDataBuilder
} from "./data";

import {
    DrawPrimitiveType,
    DrawVertexInfo,
    QBezierDescInfo
} from "./vtxmgr";

export class PathCompiler
{
    private ppmap: WeakMap<Path, PreprocessedPath>;
    private cpstrokemap: WeakMap<PreprocessedPath, WeakMap<StrokeStyle, CompiledPathset>>;
    private cpfillmap: WeakMap<PreprocessedPath, CompiledPathset>;

    constructor()
    {
        this.ppmap = new WeakMap<Path, PreprocessedPath>();
        this.cpstrokemap = new WeakMap<PreprocessedPath, WeakMap<StrokeStyle, CompiledPathset>>();
        this.cpfillmap = new WeakMap<PreprocessedPath, CompiledPathset>();
    }

    compile(path: Path, stroke: StrokeStyle): CompiledPathset
    {
        if (path.subpaths.length === 0) {
            // empty path
            return null;
        }

        let ppp = this.ppmap.get(path);
        if (!ppp) {
            this.ppmap.set(path, ppp = new PreprocessedPath(path));
        }

        if (stroke) {
            let cpsubmap = this.cpstrokemap.get(ppp);
            if (!cpsubmap) {
                this.cpstrokemap.set(ppp, cpsubmap = new WeakMap<StrokeStyle, CompiledPathset>());
            }

            let cps = cpsubmap.get(stroke);
            if (!cps) {
                const cp = new CompiledPathImpl();
                cp.compileShapePath(ppp, path, stroke);

                const cpSH = new CompiledPathImpl();
                cpSH.compileStrokeHull(cp);

                cpsubmap.set(stroke, cps = {
                    shapePath: cp,
                    drawHull: null, // stroke doesn't use draw hull
                    strokeHull: cpSH
                });
            }
            return cps;
        } else {
            let cps = this.cpfillmap.get(ppp);
            if (!cps) {
                const cp = new CompiledPathImpl();
                cp.compileShapePath(ppp, path, stroke);

                const cpDH = new CompiledPathImpl();
                cpDH.compileDrawHull(path.usage, cp);

                this.cpfillmap.set(ppp, cps = {
                    shapePath: cp,
                    drawHull: cpDH,
                    strokeHull: null
                });
            }
            return cps;
        }
    }
}

export interface CompiledPathset
{
    shapePath: CompiledPath;

    /** <code>CompiledPath</code> containing a path which is a superset of
     * <code>shapePath</code>  */
    drawHull: CompiledPath;

    /** <code>CompiledPath</code> constructed by replacing <code>shapePath</code>'s 
     * <code>DrawPrimitiveType</code> with <code>DrawPrimitiveType.Simple</code>. */
    strokeHull: CompiledPath;
}

export const globalPathCompiler = new PathCompiler();

export interface CompiledPath
{
    boundingBoxMin: Vector2;
    boundingBoxMax: Vector2;
    fbuffer: Float32Array;

    qbezierDescs: Float32Array;

    setQBezierDescAddress(ptr: number): void;
}

const compilePathTmp = new Float64Array(8 * 16);

class CompiledPathImpl implements CompiledPath
{
    boundingBoxMin: Vector2;
    boundingBoxMax: Vector2;
    buffer: Int32Array;
    fbuffer: Float32Array;
    builder: BufferBuilder;

    qbezierDescBuilder: BufferBuilder;
    qbezierDescs: Float32Array;
    qbezierRanges: number[];

    constructor()
    {
        this.boundingBoxMin = new Vector2(Infinity, Infinity);
        this.boundingBoxMax = new Vector2(-Infinity, -Infinity);
        this.builder = new BufferBuilder();
        this.qbezierDescBuilder = new BufferBuilder();
        this.qbezierRanges = [];
        this.buffer = null;
        this.fbuffer = null;
        this.qbezierDescs = null;
    }

    compileShapePath(pppath: PreprocessedPath,
        path: Path, stroke: StrokeStyle): void
    {
        path.computeBoundingBox(stroke,
            this.boundingBoxMin, this.boundingBoxMax);

        for (const subpath of pppath.subpaths) {
            if (stroke) {
                this.compileStroke(subpath, stroke);
            } else {
                this.compileFill(subpath);
            }
        }

        this.buffer = new Int32Array(this.builder.buffer, 0, this.builder.size >> 2);
        this.fbuffer = new Float32Array(this.builder.buffer, 0, this.builder.size >> 2);
        this.qbezierDescs = new Float32Array(this.qbezierDescBuilder.buffer, 0, this.qbezierDescBuilder.size >> 2);
        this.builder = null;
        this.qbezierDescBuilder = null;

        // TODO: narrow the bounding box
    }

    compileDrawHull(usage: PathUsage, orig: CompiledPathImpl): void 
    {
        if (usage == PathUsage.Static) {
            // TODO: use convex hull
            this.compileRectangle(orig.boundingBoxMin, orig.boundingBoxMax);
        } else {
            this.compileRectangle(orig.boundingBoxMin, orig.boundingBoxMax);
        }

        this.boundingBoxMin.copyFrom(orig.boundingBoxMin);
        this.boundingBoxMax.copyFrom(orig.boundingBoxMax);

        this.buffer = new Int32Array(this.builder.buffer, 0, this.builder.size >> 2);
        this.fbuffer = new Float32Array(this.builder.buffer, 0, this.builder.size >> 2);
        this.qbezierDescs = new Float32Array(this.qbezierDescBuilder.buffer, 0, this.qbezierDescBuilder.size >> 2);
        this.builder = null;
        this.qbezierDescBuilder = null;
    }

    compileStrokeHull(orig: CompiledPathImpl): void 
    {
        const buffer = orig.buffer.buffer.slice(0);
        this.buffer = new Int32Array(buffer, 0, orig.buffer.length);
        this.fbuffer = new Float32Array(buffer, 0, orig.fbuffer.length);
        this.builder = null;
        this.qbezierDescBuilder = null;
        this.qbezierDescs = new Float32Array(0);

        this.boundingBoxMin.copyFrom(orig.boundingBoxMin);
        this.boundingBoxMax.copyFrom(orig.boundingBoxMax);

        // replace PrimitiveType
        const stride = DrawVertexInfo.Size >> 2;
        const f32 = this.fbuffer;
        for (let i = 2; i < f32.length; i += stride) {
            f32[i] = DrawPrimitiveType.Simple;
        }
    }

    setQBezierDescAddress(ptr: number): void
    {
        const stride = DrawVertexInfo.Size >> 2;
        const f32 = this.fbuffer;
        const ranges = this.qbezierRanges;
        for (let i = 0; i < ranges.length; i += 2) {
            const start = ranges[i], end = ranges[i + 1];
            for (let k = start + 7; k < end; k += stride) {
                // set QuadraticStroke's quadric bezier descriptor pointer
                f32[k] = ptr;
            }
            ptr += QBezierDescInfo.NumTexels;
        }
    }

    private compileRectangle(min: Vector2, max: Vector2): void
    {
        const builder = this.builder;

        let addr = builder.allocate(DrawVertexInfo.Size * 6) >> 2;
        const {f32} = builder;
        f32[addr++] = min.x; f32[addr++] = min.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
        f32[addr++] = max.x; f32[addr++] = min.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
        f32[addr++] = min.x; f32[addr++] = max.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
        f32[addr++] = max.x; f32[addr++] = min.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
        f32[addr++] = max.x; f32[addr++] = max.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
        f32[addr++] = min.x; f32[addr++] = max.y;
        f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
    }

    private compileFill(pppath: PreprocessedSubpath): void
    {
        const data = pppath.data;
        const builder = this.builder;

        // generate anchor geometry
        let x1 = 0, y1 = 0;
        for (let i = 2; i < data.length; ) {
            const lastIndex = i;
            switch (data[i]) {
                case PathPointType.Line:
                    i += 3;
                    break;
                case PathPointType.Bezier2:
                    i += 5;
                    break;
                default:
                    throw new Error("invalid PathPointType");
            }
            if (i == data.length && pppath.cyclic) {
                // If the path is cyclic, then the straight line to the start point
                // is included in `data`.
                break;
            }
            const x2 = data[i - 2];
            const y2 = data[i - 1];
            if (lastIndex > 2) {
                // emit anchor polygn
                let addr = builder.allocate(DrawVertexInfo.Size * 3) >> 2;
                const {f32} = builder;
                f32[addr++] = data[0]; f32[addr++] = data[1];
                f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
                f32[addr++] = x1; f32[addr++] = y1;
                f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
                f32[addr++] = x2; f32[addr++] = y2;
                f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
            }
            x1 = x2; y1 = y2;
        }

        // generate discard triangles

        for (let i = 2; i < data.length; ) {
            switch (data[i]) {
                case PathPointType.Line:
                    i += 3;
                    break;
                case PathPointType.Bezier2: {
                    const x1 = data[i - 2], y1 = data[i - 1];
                    const x2 = data[i + 1], y2 = data[i + 2];
                    const x3 = data[i + 3], y3 = data[i + 4];

                    const bx1 = (x1 + x2) * 0.5, by1 = (y1 + y2) * 0.5;
                    const bx2 = (x2 + x3) * 0.5, by2 = (y2 + y3) * 0.5;

                    const cx = (bx1 + bx2) * 0.5, cy = (by1 + by2) * 0.5;

                    // emit discard polygon
                    let addr = builder.allocate(DrawVertexInfo.Size * 9) >> 2;
                    const {f32} = builder;
                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
                    f32[addr++] = cx; f32[addr++] = cy;
                    f32[addr++] = DrawPrimitiveType.Simple; addr += 5;
                    f32[addr++] = x3; f32[addr++] = y3;
                    f32[addr++] = DrawPrimitiveType.Simple; addr += 5;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 0; f32[addr++] = 0; addr += 2;
                    f32[addr++] = bx1; f32[addr++] = by1;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 0.25; f32[addr++] = 0; addr += 2;
                    f32[addr++] = cx; f32[addr++] = cy;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 0.5; f32[addr++] = 0.25; addr += 2;

                    f32[addr++] = cx; f32[addr++] = cy;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 0.5; f32[addr++] = 0.25; addr += 2;
                    f32[addr++] = bx2; f32[addr++] = by2;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 0.75; f32[addr++] = 0.5; addr += 2;
                    f32[addr++] = x3; f32[addr++] = y3;
                    f32[addr++] = DrawPrimitiveType.QuadraticFill; addr ++;
                    f32[addr++] = 1; f32[addr++] = 1; addr += 2;

                    i += 5;
                    break;
                }
                default:
                    throw new Error("invalid PathPointType");
            }
        }
    }

    private compileStroke(pppath: PreprocessedSubpath, stroke: StrokeStyle): void
    {
        const {data, cyclic} = pppath;
        const {builder, qbezierDescBuilder, qbezierRanges} = this;
        const sa = globalStrokeAnalysisManager.analyze(pppath);
        const sadata = sa.data;

        const {width, joinStyle, capStyle, miterLimit} = stroke;
        const widthHalf = width * 0.5;
        const invWidthHalf = 1 / widthHalf;

        const cosLimit = 2 / (miterLimit * miterLimit) - 1;

        const invLength = 1 / sa.totalLength;

        const tmpArray = compilePathTmp;

        let x1 = data[0], y1 = data[1];
        let saIndex = 0;
        let position = 0;

        const tmpV1 = vector2Pool.get();

        if (!cyclic && capStyle !== StrokeCapStyle.Flat) {
            // cap
            const tanX = sadata[StrokeAnalysisFields.StartTangentX];
            const tanY = sadata[StrokeAnalysisFields.StartTangentY];
            const epX1 = x1 + tanY * widthHalf, epY1 = y1 - tanX * widthHalf;
            const epX2 = x1 - tanY * widthHalf, epY2 = y1 + tanX * widthHalf;
            const cpX1 = epX1 - tanX * widthHalf, cpY1 = epY1 - tanY * widthHalf;
            const cpX2 = epX2 - tanX * widthHalf, cpY2 = epY2 - tanY * widthHalf;

            let addr = builder.allocate(DrawVertexInfo.Size * 9) >> 2;
            const {f32} = builder;

            switch (capStyle) {
                case StrokeCapStyle.Round: {
                    f32[addr++] = epX1; f32[addr++] = epY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = -1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] =  0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = -1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = -1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;
                    break;
                }
                case StrokeCapStyle.Square: {
                    f32[addr++] = epX1; f32[addr++] = epY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0.5; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0.5; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 0.5; f32[addr++] = 0; f32[addr++] = 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 0; f32[addr++] = 1; f32[addr++] = 0; f32[addr++] = 2;
                    break;
                }
                default:
                    throw new Error("bad StrokeCapStyle");
            }

        }

        for (let i = 2; i < data.length; ) {
            if (i > 2 || cyclic) {
                // emit join
                const lastSAIndex = (i == 2 ? sadata.length : saIndex)
                    - StrokeAnalysisFields.NumFields;
                const tanX1 = sadata[lastSAIndex + StrokeAnalysisFields.EndTangentX];
                const tanY1 = sadata[lastSAIndex + StrokeAnalysisFields.EndTangentY];
                const tanX2 = sadata[saIndex + StrokeAnalysisFields.StartTangentX];
                const tanY2 = sadata[saIndex + StrokeAnalysisFields.StartTangentY];
                const dot = tanX1 * tanX2 + tanY1 * tanY2;
                const curl = tanX1 * tanY2 - tanY1 * tanX2;

                switch (joinStyle) {
                    case StrokeJoinStyle.Bevel: {
                        let addr = builder.allocate(DrawVertexInfo.Size * 3) >> 2;
                        const {f32} = builder;
                        if (curl > 0) {
                            const spX = x1 + tanY1 * widthHalf, spY = y1 - tanX1 * widthHalf;
                            const epX = x1 + tanY2 * widthHalf, epY = y1 - tanX2 * widthHalf;

                            f32[addr++] = spX; f32[addr++] = spY;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 0; addr += 2;

                            f32[addr++] = epX; f32[addr++] = epY;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 0; addr += 2;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 0.5; addr += 2;
                        } else {
                            const spX = x1 - tanY1 * widthHalf, spY = y1 + tanX1 * widthHalf;
                            const epX = x1 - tanY2 * widthHalf, epY = y1 + tanX2 * widthHalf;

                            f32[addr++] = spX; f32[addr++] = spY;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 1; addr += 2;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                            f32[addr++] = epX; f32[addr++] = epY;
                            f32[addr++] = DrawPrimitiveType.Simple; addr++;
                            f32[addr++] = position; f32[addr++] = 1; addr += 2;
                        }
                        break;
                    }
                    case StrokeJoinStyle.Round: {
                        let midX = tanX1 + tanX2, midY = tanY1 + tanY2;
                        let midLn = midX * midX + midY * midY;
                        if (midLn === 0) {
                            if (curl > 0) {
                                midX = -tanY1; midY = tanX1;
                            } else {
                                midX = tanY1; midY = -tanX1;
                            }
                        } else {
                            midLn = 1 / Math.sqrt(midLn);
                            midX *= midLn; midY *= midLn;
                        }

                        // A dot X = B dot X = 1 /\ |A| = |B| = 1
                        // by solving this we get:
                        // X = |A + B| * (2 / (A dot B))

                        let q1X = tanX1 + midX, q1Y = tanY1 + midY;
                        let q1Ln = 2 / (q1X * q1X + q1Y * q1Y);
                        q1X *= q1Ln; q1Y *= q1Ln;

                        let q2X = tanX2 + midX, q2Y = tanY2 + midY;
                        let q2Ln = 2 / (q2X * q2X + q2Y * q2Y);
                        q2X *= q2Ln; q2Y *= q2Ln;

                        let addr = builder.allocate(DrawVertexInfo.Size * 9) >> 2;
                        const {f32} = builder;
                        if (curl > 0) {
                            const spX = x1 + tanY1 * widthHalf, spY = y1 - tanX1 * widthHalf;
                            const epX = x1 + tanY2 * widthHalf, epY = y1 - tanX2 * widthHalf;
                            const m1X = x1 + q1Y * widthHalf, m1Y = y1 - q1X * widthHalf;
                            const m2X = x1 + q2Y * widthHalf, m2Y = y1 - q2X * widthHalf;

                            f32[addr++] = spX; f32[addr++] = spY;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = tanY1; f32[addr++] = -tanX1;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = m1X; f32[addr++] = m1Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q1Y; f32[addr++] = -q1X;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = m1X; f32[addr++] = m1Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q1Y; f32[addr++] = -q1X;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = m2X; f32[addr++] = m2Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q2Y; f32[addr++] = -q2X;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = m2X; f32[addr++] = m2Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q2Y; f32[addr++] = -q2X;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = epX; f32[addr++] = epY;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = tanY2; f32[addr++] = -tanX2;
                            f32[addr++] = position; f32[addr++] = -0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = -0.5;
                        } else {
                            const spX = x1 - tanY1 * widthHalf, spY = y1 + tanX1 * widthHalf;
                            const epX = x1 - tanY2 * widthHalf, epY = y1 + tanX2 * widthHalf;
                            const m1X = x1 - q1Y * widthHalf, m1Y = y1 + q1X * widthHalf;
                            const m2X = x1 - q2Y * widthHalf, m2Y = y1 + q2X * widthHalf;

                            f32[addr++] = spX; f32[addr++] = spY;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = tanY1; f32[addr++] = -tanX1;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = m1X; f32[addr++] = m1Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q1Y; f32[addr++] = -q1X;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = m1X; f32[addr++] = m1Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q1Y; f32[addr++] = -q1X;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = m2X; f32[addr++] = m2Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q2Y; f32[addr++] = -q2X;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = m2X; f32[addr++] = m2Y;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = q2Y; f32[addr++] = -q2X;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = x1; f32[addr++] = y1;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = 0; f32[addr++] = 0;
                            f32[addr++] = position; f32[addr++] = 0.5;

                            f32[addr++] = epX; f32[addr++] = epY;
                            f32[addr++] = DrawPrimitiveType.Circle; addr++;
                            f32[addr++] = tanY2; f32[addr++] = -tanX2;
                            f32[addr++] = position; f32[addr++] = 0.5;
                        }
                        break;
                    }
                    case StrokeJoinStyle.Miter: {
                        const dot = tanX1 * tanX2 + tanY1 * tanY2;
                        if (dot > cosLimit) {
                            // miter join
                            let midX = tanX1 + tanX2, midY = tanY1 + tanY2;
                            const midLn = 2 / (midX * midX + midY * midY);
                            midX *= midLn; midY *= midLn;

                            let addr = builder.allocate(DrawVertexInfo.Size * 6) >> 2;
                            const {f32} = builder;
                            if (curl > 0) {
                                const spX = x1 + tanY1 * widthHalf, spY = y1 - tanX1 * widthHalf;
                                const epX = x1 + tanY2 * widthHalf, epY = y1 - tanX2 * widthHalf;
                                const mpX = x1 + midY * widthHalf,  mpY = y1 - midX * widthHalf;

                                f32[addr++] = spX; f32[addr++] = spY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = mpX; f32[addr++] = mpY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                                f32[addr++] = mpX; f32[addr++] = mpY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = epX; f32[addr++] = epY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;
                            } else {
                                const spX = x1 - tanY1 * widthHalf, spY = y1 + tanX1 * widthHalf;
                                const epX = x1 - tanY2 * widthHalf, epY = y1 + tanX2 * widthHalf;
                                const mpX = x1 - midY * widthHalf, mpY = y1 + midX * widthHalf;

                                f32[addr++] = spX; f32[addr++] = spY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                                f32[addr++] = mpX; f32[addr++] = mpY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;

                                f32[addr++] = mpX; f32[addr++] = mpY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                                f32[addr++] = epX; f32[addr++] = epY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;
                            }
                        } else {
                            // bevel join
                            let addr = builder.allocate(DrawVertexInfo.Size * 3) >> 2;
                            const {f32} = builder;
                            if (curl > 0) {
                                const spX = x1 + tanY1 * widthHalf, spY = y1 - tanX1 * widthHalf;
                                const epX = x1 + tanY2 * widthHalf, epY = y1 - tanX2 * widthHalf;

                                f32[addr++] = spX; f32[addr++] = spY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = epX; f32[addr++] = epY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;
                            } else {
                                const spX = x1 - tanY1 * widthHalf, spY = y1 + tanX1 * widthHalf;
                                const epX = x1 - tanY2 * widthHalf, epY = y1 + tanX2 * widthHalf;

                                f32[addr++] = spX; f32[addr++] = spY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;

                                f32[addr++] = x1; f32[addr++] = y1;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                                f32[addr++] = epX; f32[addr++] = epY;
                                f32[addr++] = DrawPrimitiveType.Simple; addr++;
                                f32[addr++] = position; f32[addr++] = 1; addr += 2;
                            }
                        }
                        break;
                    }
                }
            }
            const nextPosition = position +
                sadata[saIndex + StrokeAnalysisFields.Length] * invLength;
            switch (data[i]) {
                case PathPointType.Line: {
                    const x2 = data[i + 1], y2 = data[i + 2];
                    const tanX = sadata[saIndex + StrokeAnalysisFields.EndTangentX];
                    const tanY = sadata[saIndex + StrokeAnalysisFields.EndTangentY];

                    let addr = builder.allocate(DrawVertexInfo.Size * 12) >> 2;
                    const {f32} = builder;

                    const spX1 = x1 + tanY * widthHalf, spY1 = y1 - tanX * widthHalf;
                    const spX2 = x1 - tanY * widthHalf, spY2 = y1 + tanX * widthHalf;
                    const epX1 = x2 + tanY * widthHalf, epY1 = y2 - tanX * widthHalf;
                    const epX2 = x2 - tanY * widthHalf, epY2 = y2 + tanX * widthHalf;

                    f32[addr++] = spX1; f32[addr++] = spY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 0; addr += 2;

                    f32[addr++] = epX1; f32[addr++] = epY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 0; addr += 2;

                    f32[addr++] = x2; f32[addr++] = y2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 0.5; addr += 2;

                    f32[addr++] = spX1; f32[addr++] = spY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 0; addr += 2;

                    f32[addr++] = x2; f32[addr++] = y2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 0.5; addr += 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 0.5; addr += 2;


                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                    f32[addr++] = x2; f32[addr++] = y2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 0.5; addr += 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 1; addr += 2;

                    f32[addr++] = x1; f32[addr++] = y1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 0.5; addr += 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = nextPosition; f32[addr++] = 1; addr += 2;

                    f32[addr++] = spX2; f32[addr++] = spY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = position; f32[addr++] = 1; addr += 2;
 
                    x1 = x2; y1 = y2;
                    i += 3;
                    break;
                }
                case PathPointType.Bezier2: {
                    const x2 = data[i + 1], y2 = data[i + 2];
                    const x3 = data[i + 3], y3 = data[i + 4];

                    const tanX1 = sadata[saIndex + StrokeAnalysisFields.StartTangentX];
                    const tanY1 = sadata[saIndex + StrokeAnalysisFields.StartTangentY];
                    const tanX3 = sadata[saIndex + StrokeAnalysisFields.EndTangentX];
                    const tanY3 = sadata[saIndex + StrokeAnalysisFields.EndTangentY];

                    // side > 0 ==> x2 in the left side
                    const side = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
                    // TODO: what if side is zero?

                    // normal (oriented to outside)
                    const normX1 = side > 0 ? tanY1 : -tanY1, normX1WH = normX1 * widthHalf;
                    const normY1 = side > 0 ? -tanX1 : tanX1, normY1WH = normY1 * widthHalf;
                    const normX3 = side > 0 ? tanY3 : -tanY3, normX3WH = normX3 * widthHalf;
                    const normY3 = side > 0 ? -tanX3 : tanX3, normY3WH = normY3 * widthHalf;

                    // are endpoints inside the stroke?
                    const epInside1 = (x1 - normX1WH - x3) * normX3 +
                        (y1 - normY1WH - y3) * normY3 >= -widthHalf;
                    const epInside2 = (x3 - normX3WH - x1) * normX1 +
                        (y3 - normY3WH - y1) * normY1 >= -widthHalf;

                    // use convex hull?
                    // (which does not mean the stroked segment is convex)
                    const convex = epInside1 || epInside2 ||
                        computeMaximumCurvatureOfBezier2(x1, y1, x2, y2, x3, y3) >
                        1 / widthHalf;

                    // find the middle point (t = 1/2) tangent
                    let tanMX = x3 - x1, tanMY = y3 - y1;
                    const tanMLn = 1 / Math.sqrt(tanMX * tanMX + tanMY * tanMY);
                    tanMX *= tanMLn; tanMY *= tanMLn;

                    const normMX = side > 0 ? tanMY : -tanMY;
                    const normMY = side > 0 ? -tanMX : tanMX;

                    // find the middle point
                    let mx = (x1 + x3) * .25 + x2 * .5;
                    let my = (y1 + y3) * .25 + y2 * .5;

                    // find the intersections of the middle point's outer tangent
                    // and the endpoints' outer tangents
                    // TODO: this should be generic line intersection?
                    let cornerX1 = normX1 + normMX, cornerY1 = normY1 + normMY;
                    const cornerSq1 = 2 / (cornerX1 * cornerX1 + cornerY1 * cornerY1);
                    cornerX1 *= cornerSq1; cornerY1 *= cornerSq1;

                    let cornerX2 = normX3 + normMX, cornerY2 = normY3 + normMY;
                    const cornerSq2 = 2 / (cornerX2 * cornerX2 + cornerY2 * cornerY2);
                    cornerX2 *= cornerSq2; cornerY2 *= cornerSq2;

                    cornerX1 = x2 + cornerX1 * widthHalf;
                    cornerY1 = y2 + cornerY1 * widthHalf;
                    cornerX2 = x2 + cornerX2 * widthHalf;
                    cornerY2 = y2 + cornerY2 * widthHalf;

                    // generate vertices in CW (side > 0) or CCW (side <= 0)
                    let numVertices = 0;
                    if (convex) {
                        const epReallyInside1 = epInside1 &&
                            (x1 - normX1WH - x3) * tanX3 +
                            (y1 - normY1WH - y3) * tanY3 <= 0;
                        const epReallyInside2 = epInside2 &&
                            (x3 - normX3WH - x1) * tanX1 +
                            (y3 - normY3WH - y1) * tanY1 >= 0;

                        // generate vertces
                        tmpArray[64] = x1 + normX1WH; tmpArray[65] = y1 + normY1WH;
                        tmpArray[66] = cornerX1; tmpArray[67] = cornerY1;
                        tmpArray[68] = cornerX2; tmpArray[69] = cornerY2;
                        tmpArray[70] = x3 + normX3WH; tmpArray[71] = y3 + normY3WH;
                        tmpArray[72] = x3 - normX3WH; tmpArray[73] = y3 - normY3WH;
                        tmpArray[74] = x1 - normX1WH; tmpArray[75] = y1 - normY1WH;

                        // sort by X coord for convex hull generation
                        sortSixPointsByX(tmpArray);

                        // compute the convex hull using monotone chain algorithm
                        let idx = 0;
                        for (let k = 64; k < 76;) {
                            const newX = tmpArray[k++], newY = tmpArray[k++];
                            while (idx >= 16) {
                                const hX1 = tmpArray[idx - 16], hY1 = tmpArray[idx - 15];
                                const hX2 = tmpArray[idx - 8], hY2 = tmpArray[idx - 7];
                                if ((hX2 - hX1) * (newY - hY1) - (hY2 - hY1) * (newX - hX1) > 0) {
                                    break;
                                }
                                idx -= 8;
                            }
                            tmpArray[idx] = newX; tmpArray[idx + 1] = newY;
                            idx += 8;
                        }
                        let sidx = idx + 8;
                        for (let k = 72; k >= 64; k -= 2) {
                            const newX = tmpArray[k], newY = tmpArray[k + 1];
                            while (idx >= sidx) {
                                const hX1 = tmpArray[idx - 16], hY1 = tmpArray[idx - 15];
                                const hX2 = tmpArray[idx - 8], hY2 = tmpArray[idx - 7];
                                if ((hX2 - hX1) * (newY - hY1) - (hY2 - hY1) * (newX - hX1) > 0) {
                                    break;
                                }
                                idx -= 8;
                            }
                            tmpArray[idx] = newX; tmpArray[idx + 1] = newY;
                            idx += 8;
                        }
                        idx -= 8;
                        numVertices = idx >> 3;

                    } else {
                        // find the inner middle point 
                        // TODO: this might be inside the stroke!
                        const inMX = mx - normMX * widthHalf;
                        const inMY = my - normMY * widthHalf;
                        tmpArray[0] = inMX; tmpArray[1] = inMY;
                        tmpArray[8] = x1 - normX1WH; tmpArray[9] = y1 - normY1WH;
                        tmpArray[16] = x1 + normX1WH; tmpArray[17] = y1 + normY1WH;
                        tmpArray[24] = cornerX1; tmpArray[25] = cornerY1;
                        tmpArray[32] = cornerX2; tmpArray[33] = cornerY2;
                        tmpArray[40] = x3 + normX3WH; tmpArray[41] = y3 + normY3WH;
                        tmpArray[48] = x3 - normX3WH; tmpArray[49] = y3 - normY3WH;
                        numVertices = 7;
                    }


                    let qaddr = qbezierDescBuilder.allocate(16 * 4) >> 2;
                    const {f32: qf32} = qbezierDescBuilder;

                    // compute coefficients for the depressed cubic equation
                    // t^3 + pt + q = 0 for shaping
                    {
                        const nx2 = x2 - x1, ny2 = y2 - y1;
                        const nx3 = x3 - x1, ny3 = y3 - y1;
                        const dx = nx3 - nx2 * 2, dy = ny3 - ny2 * 2;
                        const dsq = dx * dx + dy * dy;
                        const dn2 = nx2 * dx + ny2 * dy;
                        const cubicA = -2 * dsq;
                        const cubicB = -6 * dn2;
                        const cubicC = -4 * (nx2 * nx2 + ny2 * ny2);
                        // const cubicD = 0;
                        const baseP = (3 * cubicA * cubicC - cubicB * cubicB) / 
                            (3 * cubicA * cubicA);
                        const baseQ = (cubicB * (2 * cubicB * cubicB - 9 * cubicA * cubicC)) / 
                            (27 * cubicA * cubicA * cubicA);
                        const invDSq = 1 / dsq;
                        const dxP = -dx * invDSq, dyP = -dy * invDSq;
                        const invDSq2 = invDSq * invDSq;
                        const curl = ny2 * nx3 - nx2 * ny3;
                        const dxQ = dy * curl * invDSq2;
                        const dyQ = dx * -curl * invDSq2;

                        for (let i = 0, idx = 0; i < numVertices; ++i, idx += 8) {
                            const vx = tmpArray[idx] - x1, vy = tmpArray[idx + 1] - y1;
                            tmpArray[idx + 2] = baseP + vx * dxP + vy * dyP;
                            tmpArray[idx + 3] = baseQ + vx * dxQ + vy * dyQ;
                        }

                        qf32[qaddr++] = x1; qf32[qaddr++] = y1;
                        qf32[qaddr++] = nx2 * invWidthHalf; qf32[qaddr++] = ny2 * invWidthHalf;
                        qf32[qaddr++] = nx3 * invWidthHalf; qf32[qaddr++] = ny3 * invWidthHalf;
                        qf32[qaddr++] = position; qf32[qaddr++] = nextPosition - position;
                        qf32[qaddr++] = cubicB / (cubicA * -3);
                    }


                    let addr = builder.allocate(DrawVertexInfo.Size * 3 * (numVertices - 2)) >> 2;
                    const {f32} = builder;
                    
                    qbezierRanges.push(addr);
                    qbezierRanges.push(addr + (numVertices - 2) * 24);

                    for (let i = 2; i < numVertices; ++i) {
                        let idx1: number, idx2: number;
                        if (side > 0 || convex) {
                            idx2 = i << 3; idx1 = idx2 - 8;
                        } else {
                            idx1 = i << 3; idx2 = idx1 - 8;
                        }
                        f32[addr++] = tmpArray[0]; f32[addr++] = tmpArray[1];
                        f32[addr++] = DrawPrimitiveType.QuadraticStroke; addr++;
                        f32[addr++] = tmpArray[2]; f32[addr++] = tmpArray[3];
                        f32[addr++] = invWidthHalf; ++addr;

                        f32[addr++] = tmpArray[idx1]; f32[addr++] = tmpArray[idx1 + 1];
                        f32[addr++] = DrawPrimitiveType.QuadraticStroke; addr++;
                        f32[addr++] = tmpArray[idx1 + 2]; f32[addr++] = tmpArray[idx1 + 3];
                        f32[addr++] = invWidthHalf; ++addr;

                        f32[addr++] = tmpArray[idx2]; f32[addr++] = tmpArray[idx2 + 1];
                        f32[addr++] = DrawPrimitiveType.QuadraticStroke; addr++;
                        f32[addr++] = tmpArray[idx2 + 2]; f32[addr++] = tmpArray[idx2 + 3];
                        f32[addr++] = invWidthHalf; ++addr;
                    }

                    x1 = x3; y1 = y3;
                    i += 5;
                    break;
                }
                default:
                    throw new Error("invalid PathPointType");
            }
            position = nextPosition;
            saIndex += StrokeAnalysisFields.NumFields;
        }

        if (!cyclic && capStyle !== StrokeCapStyle.Flat) {
            // cap
            saIndex -= StrokeAnalysisFields.NumFields;
            const tanX = sadata[saIndex + StrokeAnalysisFields.EndTangentX];
            const tanY = sadata[saIndex + StrokeAnalysisFields.EndTangentY];
            const epX1 = x1 - tanY * widthHalf, epY1 = y1 + tanX * widthHalf;
            const epX2 = x1 + tanY * widthHalf, epY2 = y1 - tanX * widthHalf;
            const cpX1 = epX1 + tanX * widthHalf, cpY1 = epY1 + tanY * widthHalf;
            const cpX2 = epX2 + tanX * widthHalf, cpY2 = epY2 + tanY * widthHalf;

            let addr = builder.allocate(DrawVertexInfo.Size * 6) >> 2;
            const {f32} = builder;

            switch (capStyle) {
                case StrokeCapStyle.Round: {
                    f32[addr++] = epX1; f32[addr++] = epY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = -1; f32[addr++] = 1; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 0; f32[addr++] = -1; f32[addr++] = 1; f32[addr++] = 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = -1; f32[addr++] = 1; f32[addr++] = 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Circle; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 1; f32[addr++] = 2;
                    break;
                }
                case StrokeCapStyle.Square: {
                    f32[addr++] = epX1; f32[addr++] = epY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; addr += 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 0; addr += 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; addr += 2;

                    f32[addr++] = epX2; f32[addr++] = epY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 0; addr += 2;

                    f32[addr++] = cpX2; f32[addr++] = cpY2;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 0; addr += 2;

                    f32[addr++] = cpX1; f32[addr++] = cpY1;
                    f32[addr++] = DrawPrimitiveType.Simple; addr++;
                    f32[addr++] = 1; f32[addr++] = 1; addr += 2;
                    break;
                }
                default:
                    throw new Error("bad StrokeCapStyle");
            }

        }

        vector2Pool.release(tmpV1);
    }
}

class StrokeAnalysisManager
{
    private map: WeakMap<PreprocessedSubpath, StrokeAnalysis>;

    constructor()
    {
        this.map = new WeakMap<PreprocessedSubpath, StrokeAnalysis>();
    }

    analyze(ppsp: PreprocessedSubpath): StrokeAnalysis
    {
        let sa = this.map.get(ppsp);
        if (!sa) {
            this.map.set(ppsp, sa = new StrokeAnalysis(ppsp));
        }
        return sa;
    }
}

const globalStrokeAnalysisManager = new StrokeAnalysisManager();

const enum StrokeAnalysisFields
{
    StartTangentX = 0,   // normalized
    StartTangentY = 1,   // normalized
    EndTangentX = 2,     // normalized
    EndTangentY = 3,     // normalized
    Length = 4,
    NumFields = 5
}

/** Analysis about PreprocessedSubpath for stroke polygon construction. */
class StrokeAnalysis
{
    /**
     * For each segment:
     * [0]: startTangentX
     * [1]: startTangentY
     * [2]: endTangentX
     * [3]: endTangentY
     * [4]: length
     */
    data: Float64Array;
    totalLength: number;

    constructor(ppsp: PreprocessedSubpath)
    {
        const {data, numSegments} = ppsp;
        const outData = this.data = new Float64Array(numSegments * StrokeAnalysisFields.NumFields);
        let outIndex = 0;
        let totalLength = 0;
        let x1 = data[0], y1 = data[1];
        const t = vector2Pool.get();
        for (let i = 2; i < data.length;) {
            switch (data[i]) {
                case PathPointType.Line: {
                    const x2 = data[i + 1], y2 = data[i + 2];
                    const dx = x2 - x1, dy = y2 - y1;
                    const sq = Math.sqrt(dx * dx + dy * dy);
                    const isq = 1 / sq;

                    outData[outIndex + StrokeAnalysisFields.StartTangentX]
                        = outData[outIndex + StrokeAnalysisFields.EndTangentX]
                        = dx * isq;
                    outData[outIndex + StrokeAnalysisFields.StartTangentY]
                        = outData[outIndex + StrokeAnalysisFields.EndTangentY]
                        = dy * isq;
                    outData[outIndex + StrokeAnalysisFields.Length] = sq;
                    totalLength += sq;
                    x1 = x2; y1 = y2;

                    i += 3;
                    break;
                }
                case PathPointType.Bezier2: {
                    const x2 = data[i + 1], y2 = data[i + 2];
                    const x3 = data[i + 3], y3 = data[i + 4];

                    evaluateBezier2Derivative(x1, y1, x2, y2, x3, y3, 0, t);
                    t.normalize();
                    outData[outIndex + StrokeAnalysisFields.StartTangentX] = t.x;
                    outData[outIndex + StrokeAnalysisFields.StartTangentY] = t.y;

                    evaluateBezier2Derivative(x1, y1, x2, y2, x3, y3, 1, t);
                    t.normalize();
                    outData[outIndex + StrokeAnalysisFields.EndTangentX] = t.x;
                    outData[outIndex + StrokeAnalysisFields.EndTangentY] = t.y;

                    const ln = computeLengthOfBezier2(x1, y1, x2, y2, x3, y3);
                    outData[outIndex + StrokeAnalysisFields.Length] = ln;
                    totalLength += ln;
                    x1 = x3; y1 = y3;

                    i += 5;
                    break;
                }
            }
            outIndex += StrokeAnalysisFields.NumFields;
        }
        this.totalLength = totalLength;
        vector2Pool.release(t);
    }
}

class PreprocessedPath
{
    subpaths: PreprocessedSubpath[];

    constructor(path: Path)
    {
        const min = new Vector2(Infinity, Infinity);
        const max = new Vector2(-Infinity, -Infinity);
        path.computeBoundingBox(null, min, max);
        const tolerance = Math.max(max.x - min.x, max.y - min.y, 1e-16) * 0.001;

        this.subpaths = path.subpaths.map(
            (subpath) => PreprocessedSubpath.preprocess(subpath, tolerance));
    }
}

class PreprocessedSubpath
{
    /*
     * data:
     *
     * The first two elements are the X/Y coordinate of the starting point.
     * Other elements are path components in one of the following formats:
     *
     * Line segment:
     *   [0] PathPoinType.Line
     *   [1] Length
     *   [2] X2
     *   [3] Y2
     * Quadratic bezier:
     *   [0] PathPointType.Bezier2
     *   [1] Length
     *   [2] X2
     *   [3] Y2
     *   [4] X3
     *   [5] Y3
     *
     */
    constructor(public data: number[], public cyclic: boolean, public numSegments: number)
    {
    }

    static preprocess(subpath: Subpath, tolerance: number): PreprocessedSubpath
    {
        const inData = subpath.data;
        let i = 2;

        // starting point
        const outData = [inData[0], inData[1]];
        let cyclic = false;
        let numSegments = 0;

        while (i < inData.length) {
            const type: PathPointType = inData[i];
            const x1 = inData[i - 2], y1 = inData[i - 1];

            switch (type) {
                case PathPointType.ClosePath:
                    // closing the path
                    if (x1 != inData[0] ||
                        y1 != inData[1]) {
                        ++numSegments;
                        outData.push(PathPointType.Line);
                        outData.push(inData[0]);
                        outData.push(inData[1]);
                    }
                    cyclic = true;
                    i += 1;
                    break;
                case PathPointType.Line: {
                    const x2 = inData[i + 1], y2 = inData[i + 2];
                    if (x2 === x1 && y2 === y1) {
                        i += 3;
                        continue;
                    }
                    ++numSegments;
                    outData.push(PathPointType.Line);
                    outData.push(x2);
                    outData.push(y2);
                    i += 3;
                    break;
                }
                case PathPointType.Bezier2: {
                    const x2 = inData[i + 1], y2 = inData[i + 2];
                    const x3 = inData[i + 3], y3 = inData[i + 4];
                    if ((x2 === x1 && y2 === y1) || (x2 === x3 && y2 === y3)) {
                        if (x1 === x3 && y1 === y3) {
                            i += 5;
                            continue;
                        } else {
                            ++numSegments;
                            outData.push(PathPointType.Line);
                            outData.push(x3);
                            outData.push(y3);
                            i += 5;
                            continue;
                        }
                    }
                    ++numSegments;
                    outData.push(PathPointType.Bezier2);
                    outData.push(x2);
                    outData.push(y2);
                    outData.push(x3);
                    outData.push(y3);
                    i += 5;
                    break;
                }
                case PathPointType.Bezier3: {
                    // Approximate cubic bezier by quadratic bezier spline.
                    const x2 = inData[i + 1], y2 = inData[i + 2];
                    const x3 = inData[i + 3], y3 = inData[i + 4];
                    const x4 = inData[i + 5], y4 = inData[i + 6];
                    if (x2 === x1 && y2 === y1 && x3 === x2 && y3 === y2 &&
                        x4 === x3 && y4 === y3) {
                        i += 7;
                        continue;
                    }
                    if (x2 === x1 && y2 === y1) {
                        if ((x3 === x4 && y3 === y4) || (x3 === x2 && y3 === y2)) {
                            ++numSegments;
                            outData.push(PathPointType.Line);
                            outData.push(x4);
                            outData.push(y4);
                            i += 7;
                            continue;
                        }
                    } else if (x3 === x4 && y3 === y4) {
                        if (x2 === x3 && y2 === y3) {
                            ++numSegments;
                            outData.push(PathPointType.Line);
                            outData.push(x4);
                            outData.push(y4);
                            i += 7;
                            continue;
                        }
                    }
                    numSegments += decomposeBezier3(x1, y1, x2, y2, x3, y3, x4, y4, 
                        tolerance, outData);
                    i += 7;
                    break;
                }
                case PathPointType.EllipticArc:
                    const cx = inData[i + 1], cy = inData[i + 2];
                    const rx = inData[i + 3], ry = inData[i + 4];
                    const startAngle = inData[i + 6], endAngle = inData[i + 7];
                    const angle = inData[i + 5]; /* skip endX, endY */
                    numSegments += decomposeArc(cx, cy, rx, ry, angle,
                        startAngle, endAngle, tolerance, outData);
                    i += 10;
                    break;
            }
        }
        return new PreprocessedSubpath(outData, cyclic, numSegments);
    }
}

const decomposeStack = new Float64Array(1024);
const foundRoots = new Float64Array(3);

/** @return the number of segments */
function decomposeArc(
    cx: number, cy: number, rx: number, ry: number,
    angle: number, startAngle: number, endAngle: number,
    tolerance: number, outData: number[]): number
{
    if (endAngle === startAngle) {
        return;
    }

    // Pomax, "A Primer on Bézier Curves."
    // https://pomax.github.io/bezierinfo/#circles
    tolerance = Math.min(0.2, tolerance / Math.max(rx, ry));
    const segmentAngleLimit = 4 * Math.acos(Math.sqrt((2 + tolerance - 
            Math.sqrt(tolerance * (2 + tolerance))) * 0.5));
    const numSegments = Math.ceil(
        Math.abs(endAngle - startAngle) / segmentAngleLimit);

    // global rotate
    const rCos = Math.cos(angle), rSin = Math.sin(angle);

    // control point positioning
    const cpPos = 1 / Math.cos(Math.abs(endAngle - startAngle) * 0.5 / numSegments);

    let segStartAngle = startAngle;

    // starting point
    let lx = Math.cos(startAngle) * rx, ly = Math.sin(startAngle) * ry;
    let x1 = lx * rCos - ly * rSin + cx;
    let y1 = lx * rSin + ly * rCos + cy;

    // FIXME: fewer trigonometric function evaluations

    for (let i = 0; i < numSegments; ++i) {
        const segEndAngle = (i + 1) / numSegments * (endAngle - startAngle) + startAngle;
        const segMidAngle = (segStartAngle + segEndAngle) * 0.5;

        lx = Math.cos(segMidAngle) * rx * cpPos; ly = Math.sin(segMidAngle) * ry * cpPos;
        let x2 = lx * rCos - ly * rSin + cx;
        let y2 = lx * rSin + ly * rCos + cy;

        lx = Math.cos(segEndAngle) * rx; ly = Math.sin(segEndAngle) * ry;
        let x3 = lx * rCos - ly * rSin + cx;
        let y3 = lx * rSin + ly * rCos + cy;

        outData.push(PathPointType.Bezier2);
        outData.push(x2); outData.push(y2);
        outData.push(x3); outData.push(y3);

        segStartAngle = segEndAngle;
        x1 = x3; y1 = y3;
    }

    return numSegments;
}

/** @return length of the curve */
function decomposeBezier3(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number,
    tolerance: number,
    outData: number[]): number
{
    // check degenerate case
    if (x1 === x2 && y1 === y2 && x3 === x4 && y3 === y4) {
        outData.push(PathPointType.Line);
        outData.push(x4);
        outData.push(y4);
        return 1;
    }

    // Use array based stack to avoid the function call
    // overhead
    const stack = decomposeStack;
    stack[0] = 0x0;
    stack[1] = x1; stack[2] = y1;
    stack[3] = x2; stack[4] = y2;
    stack[5] = x3; stack[6] = y3;
    stack[7] = x4; stack[8] = y4;

    // save to local var
    const roots = foundRoots;

    let numSegments = 0;

    let top = 9;
    // let limit = 10000;
    while (top != 0) {
        /* if (--limit < 0) {
            throw new Error("taking too much time");
        }
        if (top >= stack.length) {
            throw new Error("stack overflow");
        }*/
        let level = stack[top - 9];
        x1 = stack[top - 8]; y1 = stack[top - 7];
        x2 = stack[top - 6]; y2 = stack[top - 5];
        x3 = stack[top - 4]; y3 = stack[top - 3];
        x4 = stack[top - 2]; y4 = stack[top - 1];

        switch (level >> 4) {
            case 0x0: {
                // align the curve
                let ax1 = x4 - x1, ay1 = y4 - y1;
                if (ax1 == 0 && ay1 == 0) {
                    ax1 = 1;
                }
                const ax2 = -ay1, ay2 = ax1;
                const bx1 = 0, by1 = 0;
                const bx2 = (x2 - x1) * ax1 + (y2 - y1) * ay1;
                const by2 = (x2 - x1) * ax2 + (y2 - y1) * ay2;
                const bx3 = (x3 - x1) * ax1 + (y3 - y1) * ay1;
                const by3 = (x3 - x1) * ax2 + (y3 - y1) * ay2;
                const bx4 = (x4 - x1) * ax1 + (y4 - y1) * ay1, by4 = 0;

                // find inflctions
                const A = bx3 * by2, B = bx4 * by2;
                const C = bx2 * by3, D = bx4 * by3;
                const X = -3 * A + 2 * B + 3 * C - D;
                const Y = 3 * A - B - 3 * C;
                const Z = C - A;

                let Det = Math.sqrt(Y * Y - 4 * X * Z);
                const IX = 1 / (2 * X);
                if (X < 0) Det = -Det; // make sure sol1 < sol2
                let sol1 = (-Y - Det) * IX;
                let sol2 = (-Y + Det) * IX;
                let sol1Valid = sol1 > 0 && sol1 < 1;
                let sol2Valid = sol2 > 0 && sol2 < 1;
                if (!sol1Valid) {
                    sol1 = sol2;
                    sol1Valid = sol2Valid;
                    sol2Valid = false;
                }

                // split the curve at inflections
                // ..., [AB]  -> ..., [B], [A]
                if (sol2Valid) {
                    // ..., [ABC] -> ..., [C], [AB]
                    splitBezier3(stack, top - 8,
                        top + 1, top - 8, sol2);
                    stack[top - 9] = 0x20;
                    stack[top] = 0x20;
                    // ..., [C], [AB] -> ..., [C], [B], [A]
                    splitBezier3(stack, top + 1,
                        top + 10, top + 1, sol1 / sol2);
                    stack[top + 9] = 0x20;
                    top += 18;
                    break;
                } else if (sol1Valid) {
                    // ..., [AB] -> ..., [B], [A]
                    splitBezier3(stack, top - 8,
                        top + 1, top - 8, sol1);
                    stack[top - 9] = 0x20;
                    stack[top] = 0x20;
                    top += 9;
                    break;
                } else {
                    // no inflections, but there may be a loop
                    const dx = x4 - x1, dy = y4 - y1;
                    const f42 = dy / (y2 - y1), f32 = (y3 - y1) / (y2 - y1);
                    const ex = (dx - x2 * f42) / (x3 - x1 - (x2 - x1) * f32);
                    const ey = f42 + (1 - f32) * ex;
                    const exx = ex * ex;
                    if (ey > -0.25 * exx + 0.5 * ex + 0.75 &&
                        ey <= (ex < 0 ? (-1 / 3) * exx + ex : 
                            (Math.sqrt(12 * ex - 3 * exx) - ex) * 0.5)) {
                        // has loop; split at the furthest point
                        const frac = findFutherstPointBezier3(x1, y1, x2, y2,
                            x3, y3, x4, y4);
                        splitBezier3(stack, top - 8,
                            top + 1, top - 8, frac);
                        stack[top - 9] += 4;
                        stack[top] = stack[top - 9];
                        top += 9;
                        break;
                    }
                    stack[top - 9] = 0x20;
                }
                // fall-through
            }
            case 0x2: {
                // can a quadratic bezier curve with the same endpoints and endpoint tangent
                // as the original curve formed?
                const dx0 = x4 - x1, dy0 = y4 - y1;
                const dx1 = x2 - x1, dy1 = y2 - y1;
                const dx2 = x3 - x4, dy2 = y3 - y4;
                const sq1 = dx1 * dx1 + dy1 * dy1;
                const sq2 = dx2 * dx2 + dy2 * dy2;

                if (dx0 === 0 && dy0 === 0 &&
                    sq1 === 0 && sq2 === 0) {
                    // degenerate
                    top -= 9;
                    break;
                }

                // check the control point's inner angle
                const dot = dx1 * dx2 + dy1 * dy2;

                if (dot > 0.4 * Math.sqrt(sq1 * sq2)/* || !side1 || !side2*/) {
                    const frac = findFutherstPointBezier3(x1, y1, x2, y2,
                        x3, y3, x4, y4);
                    splitBezier3(stack, top - 8,
                        top + 1, top - 8, frac);
                    stack[top - 9] += 4;
                    stack[top] = stack[top - 9];
                    top += 9;
                    break;
                }

                stack[top - 9] = 0x30;
                // fall-through
            }
            case 0x3: {
                // Estimate the error and subdivide if the error is too much.
                // Yeon Soo Kim and Young Joon Ahn, "Explicit Error Bound for
                // Quadratic Spline Approximation of Cubic Spline."

                const dx0 = x4 - x1, dy0 = y4 - y1;
                const dx1 = x2 - x1, dy1 = y2 - y1;
                const dx2 = x3 - x4, dy2 = y3 - y4;
                let idelta0: number, idelta1: number;
                let delta0: number, delta1: number;
                let cx: number, cy: number;
                if (dx1 === 0 && dy1 === 0) {
                    idelta0 = Infinity; idelta1 = 1;
                    delta0 = 0; delta1 = 1;
                    cx = x3; cy = y3;
                } else if (dx2 === 0 && dy2 === 0) {
                    idelta0 = 1; idelta1 = Infinity;
                    delta0 = 1; delta1 = 0;
                    cx = x2; cy = y2;
                } else {
                    const p = 1 / (dx2 * dy1 - dy2 * dx1);
                    idelta0 = (dx2 * (y4 - y1) + dy2 * (x1 - x4)) * p;
                    idelta1 = (dx1 * (y4 - y1) + dy1 * (x1 - x4)) * p;
                    delta0 = 1 / idelta0;
                    delta1 = 1 / idelta1;
                    cx = x1 + dx1 * idelta0, cy = y1 + dy1 * idelta0;
                }

                // Find the cubic equation to solve
                const ap = 3 * (delta0 + delta1) - 4;
                const a = ap * ap;
                const b = ap * (-7 * delta0 - 2 * delta1 + 6);
                const c = 15 * delta0 * delta0 + 9 * delta0 * delta1 -
                    18 * delta0 + 2 * delta1;
                const d = 4 - 4 * delta1 - 3 * delta0 * delta0;

                // Compute the error
                const numRoots = solveAtMostCubicRoots(a, b, c, d, roots);
                let worst = 0, worstPos = -1;
                for (let i = 0; i < numRoots; ++i) {
                    const fr = roots[i];
                    if (!(fr > 0 && fr < 1)) {
                        continue;
                    }
                    const vl = d + fr * (c + fr * (b + fr * a));

                    // evaluate (2.4)
                    const ifr = 1 - fr;
                    const ifr2 = ifr * ifr;
                    const fr2 = fr * fr;
                    const b0 = ifr2 * ifr;
                    const b1 = 3 * fr * ifr2;
                    const b2 = 3 * fr2 * ifr;
                    const b3 = fr2 * fr;
                    const t1 = 4 * (b0 + (1 - delta0) * b1) *
                        (b3 + (1 - delta1) * b2);
                    const t2 = delta0 * b1 + delta1 * b2;
                    const t = Math.abs(t1 - t2 * t2);

                    if (t > worst) {
                        worst = t;
                        worstPos = fr;
                    }
                }

                // |q0 + q2 - 2q1|
                const ex = x1 + x4 - cx * 2;
                const ey = y1 + y4 - cy * 2;
                const ee = Math.sqrt(ex * ex + ey * ey);
                worst *= ee * 0.25;

                if (worst > tolerance) {
                    const frac = worstPos;
                    splitBezier3(stack, top - 8,
                        top + 1, top - 8, frac);
                    stack[top - 9] += 4;
                    stack[top] = stack[top - 9];
                    top += 9;
                    break;
                }

                stack[top - 9] = 0x40;
                // fall-through
            }
            case 0x4: {
                const dx0 = x4 - x1, dy0 = y4 - y1;
                const dx1 = x2 - x1, dy1 = y2 - y1;
                const dx2 = x3 - x4, dy2 = y3 - y4;

                // find the control point of the quadratic G^1 end points 
                // interpolation of the original cubic curve.
                let cx: number, cy: number;
                if (dx1 === 0 && dy1 === 0) {
                    cx = x3; cy = y3;
                } else if (dx2 === 0 && dy2 === 0) {
                    cx = x2; cy = y2;
                } else {
                    const p = 1 / (dy1 * dx2 - dx1 * dy2);
                    const t1 = (x1 * y2 - y1 * x2) * p;
                    const t2 = (x3 * y4 - y3 * x4) * p;
                    cx = t1 * (x3 - x4) - t2 * (x1 - x2);
                    cy = t1 * (y3 - y4) - t2 * (y1 - y2);
                }

                ++numSegments;
                outData.push(PathPointType.Bezier2);
                outData.push(cx);
                outData.push(cy);
                outData.push(x4);
                outData.push(y4);

                top -= 9;
                break;
            }
        } // switch (level)

    }
    // console.log(outData.length);
    return numSegments;
}

function findFutherstPointBezier3(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number): number
{
    const tx = y1 - y4, ty = x4 - x1;
    const t1 = x1 * tx + y1 * ty;
    const t2 = x2 * tx + y2 * ty - t1;
    const t3 = x3 * tx + y3 * ty - t1;
    const A = t2 - t3;
    const B = t3 - t2 * 2;
    const Det = Math.sqrt(t2 * t2 + t3 * t3 - t2 * t3);
    const IA = (1 / 3) / A;

    let worstFrac = 0.5, worst = 0;

    let frac = (-B - Det) * IA;
    if (frac > 0 && frac < 1) {
        const dist = Math.abs(frac * (1 - frac) * (t2 * (1 - frac) + t3 * frac));
        if (dist > worst) {
            worst = dist;
            worstFrac = frac;
        }
    }

    frac = (-B + Det) * IA;
    if (frac > 0 && frac < 1) {
        const dist = Math.abs(frac * (1 - frac) * (t2 * (1 - frac) + t3 * frac));
        if (dist > worst) {
            worst = dist;
            worstFrac = frac;
        }
    }

    return worstFrac;
}

function copyBezier3(stack: ArrayLike<number>,
    inIndex: number, outIndex: number): void
{
    stack[outIndex] = stack[inIndex];
    stack[outIndex + 1] = stack[inIndex + 1];
    stack[outIndex + 2] = stack[inIndex + 2];
    stack[outIndex + 3] = stack[inIndex + 3];
    stack[outIndex + 4] = stack[inIndex + 4];
    stack[outIndex + 5] = stack[inIndex + 5];
    stack[outIndex + 6] = stack[inIndex + 6];
    stack[outIndex + 7] = stack[inIndex + 7];
}

function splitBezier3(stack: ArrayLike<number>,
    inIndex: number, outIndex1: number, outIndex2: number,
    frac: number): void
{
    const x1 = stack[inIndex    ], y1 = stack[inIndex + 1];
    const x2 = stack[inIndex + 2], y2 = stack[inIndex + 3];
    const x3 = stack[inIndex + 4], y3 = stack[inIndex + 5];
    const x4 = stack[inIndex + 6], y4 = stack[inIndex + 7];

    const bx1 = mix(x1, x2, frac), by1 = mix(y1, y2, frac);
    const bx2 = mix(x2, x3, frac), by2 = mix(y2, y3, frac);
    const bx3 = mix(x3, x4, frac), by3 = mix(y3, y4, frac);

    const cx1 = mix(bx1, bx2, frac), cy1 = mix(by1, by2, frac);
    const cx2 = mix(bx2, bx3, frac), cy2 = mix(by2, by3, frac);

    const dx = mix(cx1, cx2, frac), dy = mix(cy1, cy2, frac);

    stack[outIndex1    ] = x1;  stack[outIndex1 + 1] = y1;
    stack[outIndex1 + 2] = bx1; stack[outIndex1 + 3] = by1;
    stack[outIndex1 + 4] = cx1; stack[outIndex1 + 5] = cy1;
    stack[outIndex1 + 6] = dx;  stack[outIndex1 + 7] = dy;

    stack[outIndex2    ] = dx;  stack[outIndex2 + 1] = dy;
    stack[outIndex2 + 2] = cx2; stack[outIndex2 + 3] = cy2;
    stack[outIndex2 + 4] = bx3; stack[outIndex2 + 5] = by3;
    stack[outIndex2 + 6] = x4;  stack[outIndex2 + 7] = y4;
}

const sortSixPointsByX: (tmpArray: ArrayLike<number>) => void =  
    evalWithoutContext((() => {
        let code = "(function(A){var tx,ty";
        for (let i = 0; i < 6; ++i) {
            code += `,x${i}=A[${64 + i * 2}],y${i}=A[${65 + i * 2}]`;
        }
        code += ";";
        function recurse(i: number, lower: number, upper: number): void {
            if (upper == lower + 1) {
                if (lower < i) {
                    code += `tx=x${i};ty=y${i};`;
                    for (let k = i; k > lower; --k) {
                        code += `x${k}=x${k - 1};y${k}=y${k - 1};`;
                    }
                    code += `x${lower}=tx;y${lower}=ty;`;
                }
            } else {
                const mid = (lower + upper) >> 1;
                code += `if(x${i}<x${mid - 1}){`;
                recurse(i, lower, mid);
                code += "}else{";
                recurse(i, mid, upper);
                code += "}";
            }
        }
        for (let i = 1; i < 6; ++i) {
            recurse(i, 0, i + 1);
        }
        for (let i = 0; i < 6; ++i) {
            code += `A[${64 + i * 2}]=x${i};A[${65 + i * 2}]=y${i};`;
        }
        return code + "})";
    })());
