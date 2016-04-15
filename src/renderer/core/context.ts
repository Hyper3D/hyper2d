/// <reference path="../prefix.d.ts" />

import { Context, ContextParameters } from "../frontend/context";
import { Canvas } from "../frontend/canvas";
import { CanvasImpl } from "./canvas";
import { ShaderDataBuilder } from "./data";
import { GLShaderManager } from "./glshaders";
import { VertexBufferBuilder } from "./vertexbuffer";
import { PaintCompiler } from "./paint";
import { PassthroughRenderer } from "./passthrough";
import { GLStateManager } from "./glstate";

export class ContextImpl implements Context
{
    private ready: boolean;

    shaderDataBuilder: ShaderDataBuilder;
    shaderManager: GLShaderManager;
    stateManager: GLStateManager;

    vertexBufferBuilder: VertexBufferBuilder;
    paintCompiler: PaintCompiler;

    passthroughRenderer: PassthroughRenderer;

    constructor(public gl: WebGLRenderingContext, 
        private parameters: ContextParameters)
    {
        this.ready = false;
        this.shaderDataBuilder = new ShaderDataBuilder(gl);
        this.shaderManager = new GLShaderManager(gl);
        this.vertexBufferBuilder = new VertexBufferBuilder(gl);
        this.paintCompiler = new PaintCompiler(gl);
        this.passthroughRenderer = new PassthroughRenderer(this);
        this.stateManager = new GLStateManager(gl, parameters.fastSetup);
    }

    createCanvas(width: number, height: number): Canvas
    {
        return new CanvasImpl(this, width, height);
    }

    checkSetup(): void
    {
        if (!this.ready) {
            throw new Error("setup() must be called before rendering");
        }
    }

    setup(): void
    {
        if (this.ready) {
            return;
        }

        this.stateManager.setup();
        this.ready = true;
    }

    unsetup(): void
    {
        if (!this.ready) {
            return;
        }

        this.stateManager.unsetup();
        this.ready = false;
    }
}
