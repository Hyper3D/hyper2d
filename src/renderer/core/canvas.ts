/// <reference path="../prefix.d.ts" />

import { Canvas } from "../frontend/canvas";
import { ContextImpl } from "./context";
import { Color } from "../utils/color";
import { Matrix3Like, Matrix3, Vector2 } from "../utils/geometry";
import { computeBoundingBoxForTransformedAABB } from "../utils/advgeometry";

import { Context } from "../frontend/context";
import { Path } from "../frontend/path";
import { BasePaint } from "../frontend/paint";
import { StrokeStyle } from "../frontend/stroke";
import { Sprite } from "../frontend/sprite";
import { FillRule } from "../frontend/drawingcontext";

import { Backend } from "./backend";
import { globalPathCompiler } from "./path";
import { CommandScheduler } from "./scheduler";

import { OverlapDetector } from "../utils/overlapdetector";

import {
    ClippingNode,
    Shape,
    clippingNodePool,
    shapePool
} from "./scheduler";

class ClippingLayer
{
    boundsMin: Vector2;
    boundsMax: Vector2;

    /** ClippingNode, or null if completely clipped because the user clipped too much */
    node: ClippingNode;

    constructor()
    {
        this.boundsMin = new Vector2();
        this.boundsMax = new Vector2();
        this.node = null;
    }

    calculateBoundsFrom(workingClippingPath: Shape[]): boolean
    {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const shape of workingClippingPath) {
            const {visualBoundsMin, visualBoundsMax} = shape;
            minX = Math.min(minX, visualBoundsMin.x);
            minY = Math.min(minY, visualBoundsMin.y);
            maxX = Math.max(maxX, visualBoundsMax.x);
            maxY = Math.max(maxY, visualBoundsMax.y);
        }
        this.boundsMin.set(minX, minY);
        this.boundsMax.set(maxX, maxY);
        return minX < maxX && minY < maxY;
    }
}

export class CanvasImpl implements Canvas
{
    private mainTex: WebGLTexture;
    private mainFB: WebGLFramebuffer;

    private auxTex: WebGLTexture;
    private auxFB: WebGLFramebuffer;

    private backend: Backend;
    private scheduler: CommandScheduler;

    private allocatedClippingNode: ClippingNode[];
    private allocatedShapes: Shape[];
    private clippingLayers: ClippingLayer[];
    private topClippingLayerIndex: number;

    private currentTransform: Matrix3;
    private workingClippingPath: Shape[];

    constructor(
        public ctx: ContextImpl,
        public width: number,
        public height: number)
    {
        const gl = ctx.gl;

        this.width = width = width | 0;
        this.height = height = height | 0;

        if (width < 1 || height < 1) {
            throw new Error("invalid size");
        }

        this.mainTex = gl.createTexture();
        this.mainFB = gl.createFramebuffer();
        this.auxTex = gl.createTexture();
        this.auxFB = gl.createFramebuffer();

        // Save the current bindings
        const oldTex: WebGLTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        const oldFB: WebGLFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const oldRB: WebGLRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);

        // Setup main framebuffer
        gl.bindTexture(gl.TEXTURE_2D, this.mainTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);

        const mainDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, mainDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL,
            width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.mainFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, this.mainTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
            gl.RENDERBUFFER, mainDepth);

        // Setup aux framebuffer
        /*gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);

        const auxDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, auxDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL,
            width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.auxFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, this.auxTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
            gl.RENDERBUFFER, auxDepth);*/

        gl.bindTexture(gl.TEXTURE_2D, oldTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, oldFB);
        gl.bindRenderbuffer(gl.RENDERBUFFER, oldRB);

        this.backend = new Backend(this.ctx);
        this.scheduler = new CommandScheduler(this.ctx, this.backend,
            width, height);

        this.allocatedClippingNode = [];
        this.allocatedShapes = [];
        this.clippingLayers = [new ClippingLayer()];
        this.clippingLayers[0].boundsMin.set(0, 0);
        this.clippingLayers[0].boundsMax.set(width, height);
        this.topClippingLayerIndex = 0;
        this.workingClippingPath = [];
        this.currentTransform = new Matrix3().setIdentity();

        this.reset();
    }

    get context(): Context
    {
        return this.ctx;
    }

    copyToDefaultFramebuffer(x: number, y: number, w: number, h: number): void
    {
        const {ctx, texture} = this;
        const {gl, passthroughRenderer, stateManager} = ctx;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        stateManager.flags = 0;
        gl.viewport(x, y, w, h);
        stateManager.bindTexture(gl.TEXTURE0, gl.TEXTURE_2D, texture);

        passthroughRenderer.render(0);
    }

    get texture(): WebGLTexture
    {
        return this.mainTex;
    }


    private reset(): void
    {
        // Release allocated objects
        for (const e of this.allocatedClippingNode) {
            e.reset();
            clippingNodePool.release(e);
        }
        for (const e of this.allocatedShapes) {
            e.reset();
            shapePool.release(e);
        }
        this.allocatedClippingNode.length = 0;
        this.allocatedShapes.length = 0;

        this.workingClippingPath.length = 0;

        const root = clippingNodePool.get();
        this.allocatedClippingNode.push(root);
        this.topClippingLayerIndex = 0;
        this.clippingLayers[0].node = root;
    }

    clear(color: Color): void
    {
        this.backend.clear(color);
        this.reset();
    }

    pushState(): void
    {
        throw "not implemented";
    }
    popState(): void
    {
        throw "not implemented";
    }

    setTransform(m: Matrix3Like): void
    {
        this.currentTransform.copyFrom(m);
    }

    private topClippingLayer(): ClippingLayer
    {
        return this.clippingLayers[this.topClippingLayerIndex];
    }

    private addShapeCommon(paint: BasePaint, fillRule: FillRule, style: StrokeStyle, path: Path): void
    {
        const {backend} = this;
        const compiledPath = globalPathCompiler.compile(path, style);
        if (compiledPath == null) {
            // empty path
            return;
        }

        const topClippingLayer = this.topClippingLayer();

        if (topClippingLayer.node == null) {
            // clipped completely
            return;
        }

        const shape = shapePool.get();

        const {visualBoundsMin, visualBoundsMax} = shape;

        computeBoundingBoxForTransformedAABB(this.currentTransform,
            compiledPath.shapePath.boundingBoxMin, compiledPath.shapePath.boundingBoxMax,
            visualBoundsMin, visualBoundsMax);

        const {boundsMin, boundsMax} = topClippingLayer;

        visualBoundsMin.x = Math.max(visualBoundsMin.x, boundsMin.x);
        visualBoundsMin.y = Math.max(visualBoundsMin.y, boundsMin.y);
        visualBoundsMax.x = Math.min(visualBoundsMax.x, boundsMax.x);
        visualBoundsMax.y = Math.min(visualBoundsMax.y, boundsMax.y);

        if (visualBoundsMin.x >= visualBoundsMax.x ||
            visualBoundsMin.y >= visualBoundsMax.y) {
            // clipped completely
            shapePool.release(shape);
            return;
        }

        // might be null for clipping path
        const compiledPaint = paint ? this.ctx.paintCompiler.compile(paint) : null;

        if (style) {
            shape.stencilPath = compiledPath.strokeHull;
            shape.drawPath = compiledPath.shapePath;
            shape.unstencilPath = compiledPath.strokeHull;
        } else {
            shape.stencilPath = compiledPath.shapePath;
            shape.drawPath = compiledPath.drawHull;
            shape.unstencilPath = null;
        }
        shape.fillRule = fillRule;
        shape.paint = compiledPaint;
        shape.matrix.copyFrom(this.currentTransform);

        this.allocatedShapes.push(shape);
        if (paint) {
            topClippingLayer.node.children.push(shape);
        } else {
            this.workingClippingPath.push(shape);
        }
    }

    stroke(paint: BasePaint, style: StrokeStyle, path: Path): void
    {
        this.addShapeCommon(paint, FillRule.NonZero, style, path);
    }
    fill(paint: BasePaint, fillRule: FillRule, path: Path): void
    {
        switch (fillRule) {
            case FillRule.NonZero:
            case FillRule.EvenOdd:
                break;
            default:
                throw new Error("bad FIllRule");
        }
        this.addShapeCommon(paint, fillRule, null, path);
    }
    drawSprite(sprite: Sprite): void
    {
        throw "not implemented";
    }

    strokeClippingMask(style: StrokeStyle, path: Path): void
    {
        this.addShapeCommon(null, FillRule.NonZero, style, path);
    }
    fillClippingMask(fillRule: FillRule, path: Path): void
    {
        switch (fillRule) {
            case FillRule.NonZero:
            case FillRule.EvenOdd:
                break;
            default:
                throw new Error("bad FIllRule");
        }
        this.addShapeCommon(null, fillRule, null, path);
    }
    drawSpriteClippingMask(sprite: Sprite): void
    {
        throw "not implemented";
    }
    applyClippingMask(): void
    {
        const {workingClippingPath} = this;

        this.topClippingLayerIndex++;
        if (this.clippingLayers.length <= this.topClippingLayerIndex) {
            this.clippingLayers.push(new ClippingLayer());
        }

        const topClippingLayer = this.topClippingLayer();
        topClippingLayer.node = null;

        // Completely clipped? (early check)
        if (this.clippingLayers[this.topClippingLayerIndex - 1].node == null ||
            workingClippingPath.length === 0) {
            return;
        }

        // Calculate the new bounding box
        if (!topClippingLayer.calculateBoundsFrom(workingClippingPath)) {
            // completely clipped
            return;
        }

        // Allocate a ClippingNode
        const cn = clippingNodePool.get();

        // it's faster to swap than to push every element
        const t = cn.clippingPath; cn.clippingPath = this.workingClippingPath;
        this.workingClippingPath = t;
        topClippingLayer.node = cn;
    }

    resolve(): void
    {
        const {ctx, scheduler} = this;
        const {gl} = ctx;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.mainFB);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasHalfSize",
            0.5 * this.width, 0.5 * this.height);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasSize",
            this.width, this.height);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasDoubleSize",
            2 * this.width, 2 * this.height);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasHalfInvSize",
            0.5 / this.width, 0.5 / this.height);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasInvSize",
            1 / this.width, 1 / this.height);
        this.ctx.shaderManager.setGlobalUniform("u_globalCanvasDoubleInvSize",
            2 / this.width, 2 / this.height);
        gl.viewport(0, 0, this.width, this.height);

        const root = this.clippingLayers[0].node;
        scheduler.render(root);

        this.reset();
    }
}
