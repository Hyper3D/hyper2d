
import { 
	VertexBufferAllocator,
	VertexBufferAllocation
} from "./vtxalloc";

import { Vector2 } from "../utils/geometry";

import { Path } from "../frontend/path";
import { StrokeStyle } from "../frontend/stroke";

import {
	CompiledPath, 
	CompiledPathset,
	globalPathCompiler
} from "./path";

// sync with Shape.glsl
export const enum DrawPrimitiveType {
    Simple = 0,
    QuadraticFill,
    Circle,
    QuadraticStroke
}

export const enum DrawVertexInfo {
    SizeBits = 5,
    Size = 1 << SizeBits
}

export const enum QBezierDescInfo {
	SizeBits = 4 + 2,
	Size = 1 << SizeBits,
	NumTexels = Size >> 4
}

const enum Consts {
    TexelsPerVertexBits = DrawVertexInfo.SizeBits - 4,
    TexelsPerVertex = 1 << TexelsPerVertexBits
}

export interface ResidentPath
{
	address: number;
	numVertices: number;
}

export interface ResidentPathset 
{
	shapePath: ResidentPath;
	drawHullPath: ResidentPath;
	strokeHullPath: ResidentPath;
    boundingBoxMin: Vector2;
    boundingBoxMax: Vector2;
}

/** Manages residence of path data in Vertex Buffer Texture. */
export class VertexBufferManager 
{
    private onPathDisposed: () => void;
    private onStrokeDisposed: () => void;

    private residentFillMap: Map<Path, ResidentPathsetImpl>;
    private residentStrokeMap: Map<Path, Map<StrokeStyle, ResidentPathsetImpl>>;
    private residentStrokeMap2: Map<StrokeStyle, Map<Path, ResidentPathsetImpl>>;

    constructor(private allocator: VertexBufferAllocator) 
    {
        const self = this;

        this.residentFillMap = new Map<Path, ResidentPathsetImpl>();
        this.residentStrokeMap = new Map<Path, Map<StrokeStyle, ResidentPathsetImpl>>();
        this.residentStrokeMap2 = new Map<StrokeStyle, Map<Path, ResidentPathsetImpl>>();

        this.onPathDisposed = function () {
			const path = <Path> this;  

			{
				const rp = self.residentFillMap.get(path);
				if (rp) {
					rp.dispose();
					self.residentFillMap.delete(path);
				}
			}
			{
				const slm = self.residentStrokeMap.get(path);
				if (slm) {
					slm.forEach((rp, stroke) => {
						self.residentStrokeMap2.get(stroke).delete(path);
						rp.dispose();
					});
					self.residentStrokeMap.delete(path);
				}
			}
        };
        this.onStrokeDisposed = function () {
			const stroke = <StrokeStyle> this;

			const slm = self.residentStrokeMap2.get(stroke);
			if (slm) {
				slm.forEach((rp, path) => {
					self.residentStrokeMap.get(path).delete(stroke);
					rp.dispose();
				});
				self.residentStrokeMap2.delete(stroke);
			}
        };
    }

    dispose(): void
    {
    	// TODO: dispose 
    }

    getResidentPath(path: Path, stroke: StrokeStyle): ResidentPathset
    {
		const {residentFillMap, residentStrokeMap,
			residentStrokeMap2} = this;

		if (stroke) {
			let slm = residentStrokeMap.get(path);
			if (!slm) {
				slm = new Map<StrokeStyle, ResidentPathsetImpl>();
				residentStrokeMap.set(path, slm);

				// we met the path before?
				if (residentFillMap.get(path) == null) {
					// nice to meet you!
					path.onDisposed.connect(this.onPathDisposed);
				}
			}

			let rp = slm.get(stroke);
			if (!rp) {
				rp = this.makeResidentPath(path, stroke);
				slm.set(stroke, rp);

				// also register to residentStrokeMap2
				let slm2 = residentStrokeMap2.get(stroke);
				if (!slm2) {
					slm2 = new Map<Path, ResidentPathsetImpl>();
					residentStrokeMap2.set(stroke, slm2);

					stroke.onDisposed.connect(this.onStrokeDisposed);
				}
				slm2.set(path, rp);
			}

			return rp;
		} else {
			let rp = residentFillMap.get(path);
			if (!rp) {
				rp = this.makeResidentPath(path, null);
				residentFillMap.set(path, rp);

				if (residentStrokeMap.get(path) == null) {
					path.onDisposed.connect(this.onPathDisposed);
				}
			}
			return rp;
		}
    }

    private makeResidentPath(path: Path, stroke: StrokeStyle): ResidentPathsetImpl
    {
		const cpath = globalPathCompiler.compile(path, stroke);
		return new ResidentPathsetImpl(this.allocator, cpath);
    }
}

class ResidentPathsetImpl implements ResidentPathset
{
	shapePath: ResidentPath;
	drawHullPath: ResidentPath;
	strokeHullPath: ResidentPath;
    boundingBoxMin: Vector2;
    boundingBoxMax: Vector2;

	private allocs: VertexBufferAllocation[];

	constructor(allocator: VertexBufferAllocator,
		cpathset: CompiledPathset)
	{
		this.allocs = [];
		if (cpathset) {
			this.shapePath = this.allocate(allocator, cpathset.shapePath);
			this.drawHullPath = this.allocate(allocator, cpathset.drawHull);
			this.strokeHullPath = this.allocate(allocator, cpathset.strokeHull);

			this.boundingBoxMin = cpathset.shapePath.boundingBoxMin;
			this.boundingBoxMax = cpathset.shapePath.boundingBoxMax;
		} else {
			this.shapePath = null;
			this.drawHullPath = null;
			this.strokeHullPath = null;

			this.boundingBoxMin = new Vector2(Infinity, Infinity);
			this.boundingBoxMax = new Vector2(-Infinity, -Infinity);
		}
	}

	private allocate(allocator: VertexBufferAllocator, cpath: CompiledPath): ResidentPath
	{
		if (cpath == null || cpath.fbuffer.length === 0) {
			return null;
		}

		// emit Quadratic Bezier Descriptors
		if (cpath.qbezierDescs.length > 0) {
			const qallocation = allocator.load(cpath.qbezierDescs);
			cpath.setQBezierDescAddress(qallocation.offset);
			this.allocs.push(qallocation);
		}

		// emit Vertex Buffer
		const allocation = allocator.load(cpath.fbuffer);
		this.allocs.push(allocation);
		return {
			address: allocation.offset,
			numVertices: cpath.fbuffer.length >> (DrawVertexInfo.SizeBits - 2)
		};
	}

	dispose(): void
	{
		// TODO: defer dispose until the current frame is done
		for (const alloc of this.allocs) {
			alloc.dispose();
		}
		this.allocs = null;
		this.shapePath = null;
		this.drawHullPath = null;
		this.strokeHullPath = null;
		this.boundingBoxMin = null;
		this.boundingBoxMax = null;
	}
}
