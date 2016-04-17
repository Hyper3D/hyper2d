/// <reference path="../prefix.d.ts" />

import { Canvas } from "./canvas";

import { IDisposable } from "../utils/types";

export interface Context extends IDisposable
{
    /** Creates a Canvas. */
    createCanvas(width: number, height: number): Canvas;

    /**
     * Must be called after changing the state of GL context before
     * doing drawing operations using Hyper2D.
     */
    setup(): void;

    /**
     * Restores the state of GL context to the one before calling setup().
     */
    unsetup(): void;
}

export interface ContextParameters
{
    /** 
     * If this is set to true, <code>setup()</code> doesn't save the current 
     * state of the WebGL context and saves some CPU cycles.
     */
    fastSetup?: boolean;
}

import { ContextImpl } from "../core/context";

export function createContext(
    gl: WebGLRenderingContext, parameters?: ContextParameters): Context
{
    return new ContextImpl(gl, parameters || {});
}

