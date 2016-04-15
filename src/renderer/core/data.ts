/// <reference path="../prefix.d.ts" />

import {
    requireExtension,
    OESTextureFloat
} from "../gl/glextensions";

const DataWidthBits = 11;
const DataWidth = 1 << DataWidthBits;

export class ShaderDataBuilder
{
    data: Float32Array;
    width: number;
    height: number;
    texture: WebGLTexture;

    private allocatedSize: number;
    private needsReallocation: boolean;

    constructor(public gl: WebGLRenderingContext)
    {
        this.width = DataWidth;
        this.height = 1;
        this.data = new Float32Array(DataWidth * 4);
        this.allocatedSize = 0;
        this.needsReallocation = true;
        this.texture = gl.createTexture();

        requireExtension<OESTextureFloat>(gl, "OES_texture_float");
    }

    reset(): void
    {
        this.allocatedSize = 0;
    }

    /** Allocates a data block. Returns the allocated block address.
     * @param size Size of the data block, measured in <code>vec4</code>s.
     * @param count Number of the data blocks. Defaults to 1. If the value larger than 1
     *              was specified, blocks are allocated consecutively (that is, no pads
     *              between blocks).
     */
    allocate(size: number, count?: number): number
    {
        let addr = this.allocatedSize;

        // Make sure the data block doesn't span over multiple rows
        if (size > DataWidth) {
            throw new Error("cannot allocate such a huge data block.");
        }
        if ((addr >> DataWidthBits) != ((addr + size - 1) >> DataWidthBits)) {
            addr = (addr + size - 1) & ~(DataWidth - 1);
        }
        if (!count) {
            count = 1;
        }
        if (count > 1) {
            // To make sure the allocated data blocks are consecutive,
            // starting address must be `size`-bytes aligned.
            if (size & (size - 1)) {
                throw new Error("EINVAL");
            }
            addr = (addr + size - 1) & ~(size - 1);
            size *= count;
        }

        const newHeight = (addr + size + DataWidth - 1) >> DataWidthBits;
        if (newHeight > this.height) {
            while (this.height < newHeight) {
                this.height <<= 1;
            }
            const newData = new Float32Array(this.width * this.height << 2);
            newData.set(this.data);
            this.data = newData;
            this.needsReallocation = true;
        }

        this.allocatedSize = addr + size;
        return addr << 2;
    }

    updateTexture(): void
    {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (this.needsReallocation) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
            this.needsReallocation = false;
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height,
            gl.RGBA, gl.FLOAT, this.data);
    }
}
