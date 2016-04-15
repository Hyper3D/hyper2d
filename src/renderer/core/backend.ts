/// <reference path="../prefix.d.ts" />

import {
    ContextImpl
} from "./context";

import { BufferBuilder } from "../utils/bufferbuilder";
import { CompiledPath } from "./path";
import { GLProgramInfo } from "./glshaders";
import { CompiledPaint } from "./paint";
import { Color } from "../utils/color";

import { FillRule } from "../frontend/drawingcontext";

import {
    DrawVertexSize, DrawVertexSizeBits
} from "./vertexbuffer";

import { FSDrawShader, FSDrawShaderStaticParams } from "../shaders/render/FSDraw";
import { VSDrawShader, VSDrawShaderStaticParams } from "../shaders/render/VSDraw";

import {
    Matrix3,
    Vector2
} from "../utils/geometry";

import { GLStateFlags } from "./glstate";

export interface CommandParameter
{
    worldMatrix: Matrix3;
    scissorMin: Vector2;
    scissorMax: Vector2;
    clippingLayer: number;
    paint: CompiledPaint;
}

type DrawShaderParams = FSDrawShader & VSDrawShader;
type DrawShaderStaticParams = FSDrawShaderStaticParams & VSDrawShaderStaticParams;

/** Indices for command descriptor fields */
const enum CommandDescFields
{
    WorldMatrix = 0,
    Layer = 7,
    ScissorMatrix = 8,
    Paint = 12
}

const enum CommandType
{
    Clear,
    Stencil,
    Draw,
    Unstencil,
    Clip,
    Unclip
}

export class Backend
{
    private cmds: number[];
    private lastCmdIndex: number;

    private pathPrepared: Map<CompiledPath, boolean>;
    private paintPrepared: Map<CompiledPaint, boolean>;
    private paintTextureMap: Map<WebGLTexture, number>;
    private paintTextureList: WebGLTexture[];
    private cmdToPaintTextureMap: Map<number, number>;

    private stencilShader: GLProgramInfo<DrawShaderParams>;
    private paintShader: GLProgramInfo<DrawShaderParams>;

    commandParameter: CommandParameter;

    constructor(private ctx: ContextImpl)
    {
        this.pathPrepared = new Map<CompiledPath, boolean>();
        this.paintPrepared = new Map<CompiledPaint, boolean>();
        this.paintTextureMap = new Map<WebGLTexture, number>();
        this.cmdToPaintTextureMap = new Map<number, number>();
        this.paintTextureList = [];
        this.cmds = [];
        this.lastCmdIndex = -1;

        const {shaderManager} = ctx;
        this.stencilShader = shaderManager.getProgram<DrawShaderParams>({
            fs: "FSDraw", vs: "VSDraw",
            staticParams: <DrawShaderStaticParams> {
                c_needsPaint: false
            }
        });
        this.paintShader = shaderManager.getProgram<DrawShaderParams>({
            fs: "FSDraw", vs: "VSDraw",
            staticParams: <DrawShaderStaticParams> {
                c_needsPaint: true
            }
        });

        this.commandParameter = {
            worldMatrix: new Matrix3().setIdentity(),
            scissorMax: new Vector2(),
            scissorMin: new Vector2(),
            clippingLayer: 0.5,
            paint: null
        };
    }

    /**
     * Compiles the contents of <code>this.commandParameter</code> to the shader
     * data, and returns the pointer to the command descriptor.
     * FIXME: no longer needed to be public
     */
    emitCommandDescriptor(): number
    {
        const dataBuilder = this.ctx.shaderDataBuilder;
        const idx = dataBuilder.allocate(6);
        const {data} = dataBuilder;
        const parm = this.commandParameter;
        const {worldMatrix} = parm;

        // world matrix
        data[idx + CommandDescFields.WorldMatrix + 0] = worldMatrix.e[0];
        data[idx + CommandDescFields.WorldMatrix + 1] = worldMatrix.e[1];
        data[idx + CommandDescFields.WorldMatrix + 2] = worldMatrix.e[3];
        data[idx + CommandDescFields.WorldMatrix + 3] = worldMatrix.e[4];
        data[idx + CommandDescFields.WorldMatrix + 4] = worldMatrix.e[6];
        data[idx + CommandDescFields.WorldMatrix + 5] = worldMatrix.e[7];

        // layer
        data[idx + CommandDescFields.Layer] = parm.clippingLayer * (1 / 8192);

        // scissor rect
        const {scissorMin, scissorMax} = parm;
        const sm00 = 1 / (scissorMax.x - scissorMin.x);
        const sm11 = 1 / (scissorMax.y - scissorMin.y);
        data[idx + CommandDescFields.ScissorMatrix + 0] = sm00;
        data[idx + CommandDescFields.ScissorMatrix + 1] = sm11;
        data[idx + CommandDescFields.ScissorMatrix + 2] = -scissorMin.x * sm00;
        data[idx + CommandDescFields.ScissorMatrix + 3] = -scissorMin.y * sm11;

        // paint
        const {paint} = parm;
        if (paint) {
            if (!this.paintPrepared.has(paint)) {
                this.paintPrepared.set(paint, true);
                paint.prepare(this.ctx.shaderDataBuilder);
            }

            data.set(paint.data, idx + CommandDescFields.Paint);

            let paintTextureIndex = paint.texture ?
                this.paintTextureMap.get(paint.texture) : -1;
            if (paintTextureIndex == null) {
                this.paintTextureMap.set(paint.texture,
                    paintTextureIndex = this.paintTextureList.length);
                this.paintTextureList.push(paint.texture);
            }
            this.cmdToPaintTextureMap.set(idx >> 2, paintTextureIndex);
        }

        return idx >> 2;
    }

    clear(color: Color): void
    {
        const {cmds} = this;
        this.reset();

        cmds.push(CommandType.Clear);
        // premultiplied alpha
        cmds.push(color.r * color.a);
        cmds.push(color.g * color.a);
        cmds.push(color.b * color.a);
        cmds.push(color.a);
    }

    private simpleCommand(path: CompiledPath, cmdDescPtr: number, type: CommandType,
        param1?: number, param2?: number): void
    {
        if (!this.pathPrepared.has(path)) {
            this.pathPrepared.set(path, true);
            path.prepare(this.ctx.shaderDataBuilder);
        }

        path.setCommandDescriptorPointer(cmdDescPtr);

        const bb = this.ctx.vertexBufferBuilder.builder;
        const pathdata = path.buffer;
        const pathaddr = bb.allocate(pathdata.length << 2);
        bb.s32.set(pathdata, pathaddr >> 2);

        if (pathdata.length === 0) {
            return;
        }

        const {cmds, lastCmdIndex} = this;
        if (lastCmdIndex >= 0 && cmds[lastCmdIndex] == type &&
            (param1 == null ||
             cmds[lastCmdIndex + 1] === param1 ||
             cmds[lastCmdIndex + 1] === -1 ||
             param1 === -1) &&
            (param2 == null ||
             cmds[lastCmdIndex + 2] === param2 ||
             cmds[lastCmdIndex + 2] === -1 ||
             param2 === -1)) {
            // Combine with the previous command
            let idx = lastCmdIndex + 2;
            if (param1 != null) {
                ++idx;
            }
            if (param2 != null) {
                ++idx;
            }
            cmds[idx] += pathdata.length << 2;
        } else {
            // Start new command
            this.lastCmdIndex = cmds.length;
            cmds.push(type);
            if (param1 != null){
                cmds.push(param1);
            }
            if (param2 != null){
                cmds.push(param2);
            }
            cmds.push(pathaddr);
            cmds.push(pathdata.length << 2);
        }
    }

    stencil(path: CompiledPath, cmdDescPtr: number, fillRule: FillRule): void {
        this.simpleCommand(path, cmdDescPtr, CommandType.Stencil, fillRule);
    }

    unstencil(path: CompiledPath, cmdDescPtr: number): void {
        this.simpleCommand(path, cmdDescPtr, CommandType.Unstencil);
    }

    clip(path: CompiledPath, cmdDescPtr: number): void
    {
        this.simpleCommand(path, cmdDescPtr, CommandType.Clip);
    }

    unclip(path: CompiledPath, cmdDescPtr: number): void
    {
        this.simpleCommand(path, cmdDescPtr, CommandType.Unclip);
    }

    draw(path: CompiledPath, cmdDescPtr: number): void
    {
        const paintTextureIndex = this.cmdToPaintTextureMap.get(cmdDescPtr);
        if (paintTextureIndex == null) {
            throw new Error("Command descriptor wasn't emit with a paint");
        }
        this.simpleCommand(path, cmdDescPtr, CommandType.Draw, paintTextureIndex);
    }

    private executeDrawShader(shader: GLProgramInfo<DrawShaderParams>, cmdIdx: number): void
    {
        const {ctx, cmds} = this;
        const {gl, stateManager} = ctx;

        shader.use();
        stateManager.enabledVertexAttribArrays =
            (1 << shader.params.a_position) |
            (1 << shader.params.a_commandPtr) |
            (1 << shader.params.a_primitiveType) |
            (1 << shader.params.a_primitiveParams);
        gl.uniform1i(shader.params.u_data, 0);
        gl.uniform1i(shader.params.u_texture, 1);

        const offs = cmds[cmdIdx];
        gl.vertexAttribPointer(shader.params.a_position, 2, gl.FLOAT,
            false, DrawVertexSize, offs);
        gl.vertexAttribPointer(shader.params.a_primitiveType, 1, gl.FLOAT,
            false, DrawVertexSize, offs + 8);
        gl.vertexAttribPointer(shader.params.a_commandPtr, 1, gl.FLOAT,
            false, DrawVertexSize, offs + 12);
        gl.vertexAttribPointer(shader.params.a_primitiveParams, 4, gl.FLOAT,
            false, DrawVertexSize, offs + 16);
        gl.drawArrays(gl.TRIANGLES, 0, cmds[cmdIdx + 1] >> DrawVertexSizeBits);
        if (cmds[cmdIdx + 1] >> DrawVertexSizeBits === 0) {
            throw "hoge";
        }
    }

    complete(): void
    {
        const {ctx, cmds} = this;
        const {shaderDataBuilder, vertexBufferBuilder,
            gl, stateManager, shaderManager} = ctx;

        shaderDataBuilder.updateTexture();
        vertexBufferBuilder.updateBuffer();

        shaderManager.setGlobalUniform("u_dataSize",
            shaderDataBuilder.width, shaderDataBuilder.height,
            1 / shaderDataBuilder.width, 1 / shaderDataBuilder.height);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferBuilder.vbo);
        stateManager.bindTexture(gl.TEXTURE0, gl.TEXTURE_2D, shaderDataBuilder.texture);

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        let numDrawCalls = 0;

        for (let i = 0; i < cmds.length;) {
            ++numDrawCalls;

            switch (cmds[i]) {
                case CommandType.Clear: {
                    stateManager.flags =
                        GLStateFlags.DepthWriteEnabled |
                        GLStateFlags.StencilWriteEnabled;
                    gl.stencilMask(0xff);
                    gl.clearColor(cmds[i + 1], cmds[i + 2], cmds[i + 3], cmds[i + 4]);
                    gl.clearDepth(0);
                    gl.clearStencil(0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
                    i += 5;
                    break;
                }
                case CommandType.Stencil: {
                    const shader = this.stencilShader;
                    stateManager.flags =
                        GLStateFlags.DepthTestEnabled |
                        GLStateFlags.StencilWriteEnabled |
                        GLStateFlags.ColorWriteDisabled |
                        GLStateFlags.StencilTestEnabled;
                    gl.stencilFunc(gl.ALWAYS, 0, 0);
                    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
                    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
                    switch (<FillRule>cmds[i + 1]) {
                        case FillRule.EvenOdd:
                            gl.stencilMask(0x01);
                            break;
                        case FillRule.NonZero:
                            gl.stencilMask(0xff);
                            break;
                    }
                    gl.depthFunc(gl.GEQUAL);
                    this.executeDrawShader(shader, i + 2);
                    i += 4;
                    break;
                }
                case CommandType.Unstencil: {
                    const shader = this.stencilShader;
                    stateManager.flags =
                        GLStateFlags.DepthTestEnabled |
                        GLStateFlags.StencilWriteEnabled |
                        GLStateFlags.ColorWriteDisabled |
                        GLStateFlags.StencilTestEnabled;
                    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
                    gl.stencilMask(0xff);
                    gl.depthFunc(gl.GEQUAL);
                    this.executeDrawShader(shader, i + 1);
                    i += 3;
                    break;
                }
                case CommandType.Draw: {
                    const shader = this.paintShader;

                    stateManager.flags =
                        GLStateFlags.StencilTestEnabled |
                        GLStateFlags.StencilWriteEnabled |
                        GLStateFlags.BlendEnabled;
                    gl.stencilMask(0xff);

                    const texIndex = cmds[i + 1];
                    if (texIndex != -1) {
                        stateManager.bindTexture(gl.TEXTURE1, gl.TEXTURE_2D,
                            this.paintTextureList[texIndex]);
                    }

                    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
                    this.executeDrawShader(shader, i + 2);
                    i += 4;
                    break;
                }
                case CommandType.Clip: {
                    const shader = this.stencilShader;

                    stateManager.flags =
                        GLStateFlags.StencilTestEnabled |
                        GLStateFlags.StencilWriteEnabled |
                        GLStateFlags.DepthWriteEnabled |
                        GLStateFlags.ColorWriteDisabled;
                    gl.stencilMask(0xff);
                    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
                    this.executeDrawShader(shader, i + 1);
                    i += 3;
                    break;
                }
                case CommandType.Unclip: {
                    const shader = this.stencilShader;

                    stateManager.flags =
                        GLStateFlags.DepthWriteEnabled |
                        GLStateFlags.DepthTestEnabled |
                        GLStateFlags.ColorWriteDisabled;
                    gl.depthFunc(gl.GREATER);
                    this.executeDrawShader(shader, i + 1);
                    i += 3;
                    break;
                }
                default:
                    throw new Error("bad CommandType");
            } // switch (cmds[i])
        }

        this.reset();
    }

    private reset(): void
    {
        const {ctx, cmds} = this;

        ctx.shaderDataBuilder.reset();
        ctx.vertexBufferBuilder.reset();

        this.paintPrepared.clear();
        this.pathPrepared.clear();
        this.paintTextureMap.clear();
        this.cmdToPaintTextureMap.clear();
        this.paintTextureList.length = 0;
        cmds.length = 0;
        this.lastCmdIndex = -1;
    }
}

