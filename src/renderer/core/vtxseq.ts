
import { ulog2 } from "../utils/math";

/** This one just emits an integer sequence. */
export class VertexBufferSequenceBuilder
{
    vbo: WebGLBuffer;
    buffer: Float32Array;
    lastSize: number;

    constructor(private gl: WebGLRenderingContext)
    {
        this.buffer = null;
        this.vbo = gl.createBuffer();
        this.lastSize = 0;
    }

    updateBuffer(numElements: number): void
    {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

        if (numElements > this.lastSize) {
            numElements = Math.max(numElements, 512);
            const buffer = new Float32Array(2 << ulog2(numElements - 1));
            for (let i = 0; i < buffer.length; ++i) {
                buffer[i] = i;
            }
            gl.bufferData(gl.ARRAY_BUFFER, buffer,
                gl.STATIC_DRAW);
            this.lastSize = numElements;
        }
    }
}