/// <reference path="../prefix.d.ts" />

import { DrawingContext } from "./drawingcontext";
import { Context } from "./context";
import { Color } from "../utils/color";

export interface Canvas extends DrawingContext
{
    ctx: Context;

    width: number;
    height: number;

    texture: WebGLTexture;

    /**
     * Clears the entire region of the canvas.
     * Clipping does not apply.
     */
    clear(color: Color): void;

    /**
     * Perform all pending rendering operations, and store the result
     * into <code>texture</code>.
     * The contents of <code>texture</code> can be assumed valid only after calling
     * <code>resolve()</code>.
     */
    resolve(): void;

    copyToDefaultFramebuffer(x: number, y: number, w: number, h: number): void;
}


