
import {
    BufferBuilder
} from "../utils/bufferbuilder";

import {
    Heap, 
    HeapRegion
} from "../utils/heap";

import { IDisposable } from "../utils/types";

import {
    ulog2
} from "../utils/math";

import {
    setBitArrayRange,
    findZeroInBitArray,
    findOneInBitArray
} from "../utils/bitarray";

import { GLShaderManager } from "./glshaders";

/** Manages our vertex buffer (realized as a texture). */
export class VertexBufferAllocator
{
    texture: WebGLTexture;

    private heap: Heap;
    private needsReallocation: boolean;
    private sizeBits: number; // width = 1 << sizeBits
    private buffer: Float32Array;

    /** Bit array that tells which row of the texture should be updated */
    private dirtyMap: Int32Array; 
    
    constructor(private gl: WebGLRenderingContext)
    {
        this.heap = new Heap();
        this.texture = gl.createTexture();
        this.needsReallocation = true;
        this.sizeBits = 6;
        this.heap.resize(1 << (this.sizeBits * 2));
        this.buffer = new Float32Array(1 << (this.sizeBits * 2 + 2));
        this.dirtyMap = null;
    }

    load(buffer: Float32Array): VertexBufferAllocation
    {
        const {heap} = this;
        let region = heap.get(buffer.length >> 2);
        if (region == null) {
            do {
                // allocation failed! expand the texture
                this.sizeBits++;
                this.heap.resize(1 << (this.sizeBits * 2));
                region = heap.get(buffer.length >> 2);
            } while (region == null);

            this.dirtyMap = null;
            const newBuffer = new Float32Array(1 << (this.sizeBits * 2 + 2))
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
            this.needsReallocation = true;
        }

        this.buffer.set(buffer, region.offset << 2);

        if (this.dirtyMap) {
            setBitArrayRange(this.dirtyMap,
                region.offset >> this.sizeBits,
                (region.offset + region.length + (1 << this.sizeBits) - 1) >> this.sizeBits);
        }

        return new VertexBufferAllocationImpl(this.heap, region);
    }

    updateTexture(): void
    {
        const {gl, sizeBits} = this;
        const size = 1 << sizeBits;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (this.needsReallocation) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                size, size, 0, gl.RGBA, gl.FLOAT, this.buffer);
            this.needsReallocation = false;
            this.dirtyMap = new Int32Array(1 << (this.sizeBits - 5));
        } else {
            // call texSubImage2D on dirty rows
            const {dirtyMap, buffer} = this;
            let y = 0;
            while (y < size) {
                y = findOneInBitArray(dirtyMap, y);
                if (y === -1) {
                    break;
                }

                let y2 = findZeroInBitArray(dirtyMap, y);
                if (y2 === -1) {
                    y2 = size;
                }

                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, size, y2 - y,
                    gl.RGBA, gl.FLOAT, 
                    buffer.subarray(y << (sizeBits + 2), y2 << (sizeBits + 2)));

                y = y2;
            }

            for (let i = 0; i < dirtyMap.length; ++i) {
                dirtyMap[i] = 0;
            }
        }
    }

    updateGlobalUniform(shaderManager: GLShaderManager): void
    {
        const rS = 1 / (1 << this.sizeBits);
        shaderManager.setGlobalUniform("u_vertexBufferUVCoef",
            rS * 0.5, rS * rS * 0.5, rS, rS * rS);
    }
}

export interface VertexBufferAllocation extends IDisposable
{
    offset: number;
}

class VertexBufferAllocationImpl implements VertexBufferAllocation
{
    offset: number;

    constructor(private heap: Heap, private region: HeapRegion)
    {
        this.offset = region.offset;
    }

    dispose(): void
    {
        this.heap.release(this.region);
        this.region = null;
        this.heap = null;
    }
}
