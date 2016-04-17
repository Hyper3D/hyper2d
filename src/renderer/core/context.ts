/// <reference path="../prefix.d.ts" />

import { Context, ContextParameters } from "../frontend/context";
import { Canvas } from "../frontend/canvas";
import { CanvasImpl } from "./canvas";
import { ShaderDataBuilder } from "./data";
import { GLShaderManager } from "./glshaders";
import { VertexBufferAllocator } from "./vtxalloc";
import { VertexBufferManager } from "./vtxmgr";
import { VertexBufferSequenceBuilder } from "./vtxseq";
import { PaintCompiler } from "./paint";
import { PassthroughRenderer } from "./passthrough";
import { GLStateManager } from "./glstate";

export class ContextImpl implements Context
{
    private ready: boolean;

    shaderDataBuilder: ShaderDataBuilder;
    shaderManager: GLShaderManager;
    stateManager: GLStateManager;

    vertexBufferAllocator: VertexBufferAllocator;
    vertexBufferManager: VertexBufferManager;
    vertexBufferSequenceBuilder: VertexBufferSequenceBuilder;
    paintCompiler: PaintCompiler;

    passthroughRenderer: PassthroughRenderer;

    constructor(public gl: WebGLRenderingContext, 
        private parameters: ContextParameters)
    {
        this.ready = false;
        this.shaderDataBuilder = new ShaderDataBuilder(gl);
        this.shaderManager = new GLShaderManager(gl);
        this.vertexBufferAllocator = new VertexBufferAllocator(gl);
        this.vertexBufferManager = new VertexBufferManager(this.vertexBufferAllocator);
        this.vertexBufferSequenceBuilder = new VertexBufferSequenceBuilder(gl);
        this.paintCompiler = new PaintCompiler(gl);
        this.passthroughRenderer = new PassthroughRenderer(this);
        this.stateManager = new GLStateManager(gl, parameters.fastSetup);
    }

    createCanvas(width: number, height: number): Canvas
    {
        return new CanvasImpl(this, width, height);
    }

    dispose(): void
    {
        this.vertexBufferManager.dispose();
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
