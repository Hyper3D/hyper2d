
import {
    BufferBuilder
} from "../utils/bufferbuilder";

// sync with Shape.glsl
export const enum DrawPrimitiveType
{
    Simple = 0,
    QuadraticFill,
    Circle,
    QuadraticStroke
}

export const DrawVertexSizeBits = 5;
export const DrawVertexSize = 1 << DrawVertexSizeBits;

export class VertexBufferBuilder
{
    vbo: WebGLBuffer;
    builder: BufferBuilder;
    lastSize: number;

    constructor(private gl: WebGLRenderingContext)
    {
        this.builder = new BufferBuilder();
        this.vbo = gl.createBuffer();
        this.lastSize = 0;
    }

    reset(): void
    {
        this.builder.reset();
    }

    updateBuffer(): void
    {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

        const {s32} = this.builder;
        if (s32.length == this.lastSize) {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0,
                s32.subarray(0, this.builder.size >> 2));
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, s32,
                gl.DYNAMIC_DRAW);
            this.lastSize = s32.length;
        }
    }
}