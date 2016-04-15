
export const enum GLStateFlags
{
    Default,
    DepthTestEnabled = 1 << 0,
    DepthWriteEnabled = 1 << 1,
    StencilTestEnabled = 1 << 2,
    BlendEnabled = 1 << 3,

    ColorRedWriteDisabled = 1 << 4,
    ColorGreenWriteDisabled = 1 << 5,
    ColorBlueWriteDisabled = 1 << 6,
    ColorAlphaWriteDisabled = 1 << 7,
    ColorRGBWriteDisabled = ColorRedWriteDisabled | ColorGreenWriteDisabled | ColorBlueWriteDisabled,
    ColorWriteDisabled = ColorRGBWriteDisabled | ColorAlphaWriteDisabled,

    CullFaceEnabled = 1 << 8,

    FrontFaceCW = 1 << 9,
    ScissorTestEnabled = 1 << 10,

    /** This flag only can be used for disabling stencil write; you must set
     * the write mask directly.
     * WARNING: When stencil write is enabled, stencil test must be enabled as well.
     */
    StencilWriteEnabled = 1 << 11
}

export class GLStateManager
{
    private curFlags: GLStateFlags;
    private curActiveTexture: number;
    private curVertexAttribArrays: number;

    private origFlags: GLStateFlags;
    private origTex2D: WebGLTexture[];
    private origFB: WebGLFramebuffer;
    private origRB: WebGLRenderbuffer;
    private origActiveTexture: number;
    private origDepthFunc: number;
    private origBlendSrcRGB: number;
    private origBlendSrcAlpha: number;
    private origBlendDestRGB: number;
    private origBlendDestAlpha: number;
    private origBlendEqRGB: number;
    private origBlendEqAlpha: number;
    private origClearColor: ArrayLike<number>
    private origClearDepth: number;
    private origClearStencil: number;
    private origStencilFail: number;
    private origStencilFunc: number;
    private origStencilPassDepthFail: number;
    private origStencilPassDepthPass: number;
    private origStencilRef: number;
    private origStencilValueMask: number;
    private origStencilWriteMask: number;
    private origStencilBackFail: number;
    private origStencilBackFunc: number;
    private origStencilBackPassDepthFail: number;
    private origStencilBackPassDepthPass: number;
    private origStencilBackRef: number;
    private origStencilBackValueMask: number;
    private origStencilBackWriteMask: number;
    private origVertexAttribs: VertexAttribArraySaver[];

    constructor(private gl: WebGLRenderingContext,
        private fastSetup: boolean)
    {
        this.curFlags = GLStateFlags.Default;
        this.curActiveTexture = -1;
        this.curVertexAttribArrays = 0;

        this.origFlags = GLStateFlags.Default;
        const origTex2D: WebGLTexture[] = this.origTex2D = [];
        this.origFB = null;
        this.origRB = 0;
        for (let i = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS); i > 0; --i) {
            origTex2D.push(null);
        }
        this.origActiveTexture = 0;
        this.origDepthFunc = 0;
        this.origBlendSrcRGB = 0;
        this.origBlendSrcAlpha = 0;
        this.origBlendDestRGB = 0;
        this.origBlendDestAlpha = 0;
        this.origBlendEqRGB = 0;
        this.origBlendEqAlpha = 0;
        this.origClearColor = [0, 0, 0, 0];
        this.origClearDepth = 0;
        this.origClearStencil = 0;
        this.origStencilFail = 0;
        this.origStencilFunc = 0;
        this.origStencilPassDepthFail = 0;
        this.origStencilPassDepthPass = 0;
        this.origStencilRef = 0;
        this.origStencilValueMask = 0;
        this.origStencilWriteMask = 0;
        this.origStencilBackFail = 0;
        this.origStencilBackFunc = 0;
        this.origStencilBackPassDepthFail = 0;
        this.origStencilBackPassDepthPass = 0;
        this.origStencilBackRef = 0;
        this.origStencilBackValueMask = 0;
        this.origStencilBackWriteMask = 0;
        const origVertexAttribs: VertexAttribArraySaver[] = this.origVertexAttribs = [];
        for (let k = Math.min(32, gl.getParameter(gl.MAX_VERTEX_ATTRIBS)), i = 0; i < k; ++i) {
            origVertexAttribs.push(new VertexAttribArraySaver(gl, i));
        }
    }

    setup(): void
    {
        const {gl, origTex2D} = this;
        if (this.fastSetup) {
            this.setFlags(this.curFlags, true);
            gl.activeTexture(gl.TEXTURE0);
            this.curActiveTexture = gl.TEXTURE0;
            this.curVertexAttribArrays = 0;
        } else {
            this.curFlags = this.origFlags = this.readFlags();
            this.origActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
            for (let i = 0; i < origTex2D.length; ++i) {
                gl.activeTexture(gl.TEXTURE0 + i);
                origTex2D[i] = gl.getParameter(gl.TEXTURE_BINDING_2D);
            }
            this.origFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            this.origRB = gl.getParameter(gl.RENDERBUFFER_BINDING);
            this.origDepthFunc = gl.getParameter(gl.DEPTH_FUNC);
            this.origBlendSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);
            this.origBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
            this.origBlendDestRGB = gl.getParameter(gl.BLEND_DST_RGB);
            this.origBlendDestAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);
            this.origBlendEqRGB = gl.getParameter(gl.BLEND_EQUATION_RGB);
            this.origBlendEqAlpha = gl.getParameter(gl.BLEND_EQUATION_ALPHA);
            this.origClearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE);
            this.origClearDepth = gl.getParameter(gl.DEPTH_CLEAR_VALUE);
            this.origClearStencil = gl.getParameter(gl.STENCIL_CLEAR_VALUE);;
            this.origStencilFail = gl.getParameter(gl.STENCIL_FAIL);
            this.origStencilFunc = gl.getParameter(gl.STENCIL_FUNC);
            this.origStencilPassDepthFail = gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL);
            this.origStencilPassDepthPass = gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS);
            this.origStencilRef = gl.getParameter(gl.STENCIL_REF);
            this.origStencilValueMask = gl.getParameter(gl.STENCIL_VALUE_MASK);
            this.origStencilWriteMask = gl.getParameter(gl.STENCIL_WRITEMASK);
            this.origStencilBackFail = gl.getParameter(gl.STENCIL_BACK_FAIL);
            this.origStencilBackFunc = gl.getParameter(gl.STENCIL_BACK_FUNC);
            this.origStencilBackPassDepthFail = gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_FAIL);
            this.origStencilBackPassDepthPass = gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_PASS);
            this.origStencilBackRef = gl.getParameter(gl.STENCIL_BACK_REF);
            this.origStencilBackValueMask = gl.getParameter(gl.STENCIL_BACK_VALUE_MASK);
            this.origStencilBackWriteMask = gl.getParameter(gl.STENCIL_BACK_WRITEMASK);
            this.curVertexAttribArrays = 0;
            for (const va of this.origVertexAttribs) {
                va.setup();
                if (va.enabled) {
                    this.curVertexAttribArrays |= 1 << va.idx;
                }
            }
            this.curActiveTexture = gl.TEXTURE0 + origTex2D.length - 1;
        }
    }

    unsetup(): void
    {
        if (this.fastSetup) {
            return;
        }
        const {gl, origTex2D} = this;
        this.flags = this.origFlags;
        for (let i = 0; i < origTex2D.length; ++i) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, origTex2D[i]);
        }
        gl.activeTexture(this.origActiveTexture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.origFB);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.origRB);
        gl.depthFunc(this.origDepthFunc);
        gl.blendFuncSeparate(this.origBlendSrcRGB, this.origBlendDestRGB,
            this.origBlendSrcRGB, this.origBlendSrcAlpha);
        gl.blendEquationSeparate(this.origBlendEqRGB, this.origBlendEqAlpha);
        const {origClearColor} = this;
        gl.clearColor(origClearColor[0], origClearColor[1],
            origClearColor[2], origClearColor[3]);
        gl.clearDepth(this.origClearDepth);
        gl.clearStencil(this.origClearStencil);
        gl.stencilFuncSeparate(gl.FRONT, this.origStencilFunc, this.origStencilRef,
            this.origStencilValueMask);
        gl.stencilMaskSeparate(gl.FRONT, this.origStencilWriteMask);
        gl.stencilOpSeparate(gl.FRONT, this.origStencilFail,
            this.origStencilPassDepthFail, this.origStencilPassDepthPass);
        gl.stencilFuncSeparate(gl.BACK, this.origStencilBackFunc, this.origStencilBackRef,
            this.origStencilBackValueMask);
        gl.stencilMaskSeparate(gl.BACK, this.origStencilBackWriteMask);
        gl.stencilOpSeparate(gl.BACK, this.origStencilBackFail,
            this.origStencilBackPassDepthFail, this.origStencilBackPassDepthPass);
        for (const va of this.origVertexAttribs) {
            va.unsetup();
        }
    }

    private setFlags(newFlags: GLStateFlags, force: boolean): void
    {
        const {gl} = this;
        const changed = force ? 0x7fffffff : (this.curFlags ^ newFlags);

        if (changed & GLStateFlags.DepthTestEnabled) {
            if (newFlags & GLStateFlags.DepthTestEnabled) {
                gl.enable(gl.DEPTH_TEST);
            } else {
                gl.disable(gl.DEPTH_TEST);
            }
        }
        if (changed & GLStateFlags.DepthWriteEnabled) {
            if (newFlags & GLStateFlags.DepthWriteEnabled) {
                gl.depthMask(true);
            } else {
                gl.depthMask(false);
            }
        }
        if (changed & GLStateFlags.StencilTestEnabled) {
            if (newFlags & GLStateFlags.StencilTestEnabled) {
                gl.enable(gl.STENCIL_TEST);
            } else {
                gl.disable(gl.STENCIL_TEST);
            }
        }
        if (changed & GLStateFlags.BlendEnabled) {
            if (newFlags & GLStateFlags.BlendEnabled) {
                gl.enable(gl.BLEND);
            } else {
                gl.disable(gl.BLEND);
            }
        }
        if (changed & GLStateFlags.ColorWriteDisabled) {
            gl.colorMask(
                (newFlags & GLStateFlags.ColorRedWriteDisabled) == 0,
                (newFlags & GLStateFlags.ColorGreenWriteDisabled) == 0,
                (newFlags & GLStateFlags.ColorBlueWriteDisabled) == 0,
                (newFlags & GLStateFlags.ColorAlphaWriteDisabled) == 0);
        }
        if (changed & GLStateFlags.CullFaceEnabled) {
            if (newFlags & GLStateFlags.CullFaceEnabled) {
                gl.enable(gl.CULL_FACE);
            } else {
                gl.disable(gl.CULL_FACE);
            }
        }
        if (changed & GLStateFlags.FrontFaceCW) {
            if (newFlags & GLStateFlags.FrontFaceCW) {
                gl.frontFace(gl.CW);
            } else {
                gl.frontFace(gl.CCW);
            }
        }
        if (changed & GLStateFlags.ScissorTestEnabled) {
            if (newFlags & GLStateFlags.ScissorTestEnabled) {
                gl.enable(gl.SCISSOR_TEST);
            } else {
                gl.disable(gl.SCISSOR_TEST);
            }
        }
        if (changed & GLStateFlags.StencilWriteEnabled) {
            if (newFlags & GLStateFlags.StencilWriteEnabled) {
            } else {
                gl.stencilMask(0);
            }
        }

        this.curFlags = newFlags;
    }

    get flags(): GLStateFlags
    {
        return this.curFlags;
    }
    set flags(newFlags: GLStateFlags)
    {
        this.setFlags(newFlags, false);
    }

    get enabledVertexAttribArrays(): number
    {
        return this.curVertexAttribArrays;
    }
    set enabledVertexAttribArrays(newMask: number)
    {
        const {curVertexAttribArrays, gl} = this;
        let changed = curVertexAttribArrays ^ newMask;
        this.curVertexAttribArrays = newMask;
        for (let i = 0; i < 32; i += 8) {
            for (let k = 0; k < 8; ++k) {
                if (changed & (1 << k)) {
                    if (newMask & (1 << k)) {
                        gl.enableVertexAttribArray(i + k);
                    } else {
                        gl.disableVertexAttribArray(i + k);
                    }
                }
            }
            newMask >>>= 8; changed >>>= 8;
        }
    }

    bindTexture(stage: number, type: number, obj: WebGLTexture): void
    {
        const {gl} = this;

        if (stage !== this.curActiveTexture) {
            gl.activeTexture(stage);
            this.curActiveTexture = stage;
        }

        gl.bindTexture(type, obj);
    }

    private readFlags(): GLStateFlags
    {
        let ret = GLStateFlags.Default;
        const {gl} = this;

        if (gl.getParameter(gl.DEPTH_TEST)) {
            ret |= GLStateFlags.DepthTestEnabled;
        }
        if (gl.getParameter(gl.DEPTH_WRITEMASK)) {
            ret |= GLStateFlags.DepthWriteEnabled;
        }
        if (gl.getParameter(gl.STENCIL_TEST)) {
            ret |= GLStateFlags.StencilTestEnabled;
        }
        if (gl.getParameter(gl.BLEND)) {
            ret |= GLStateFlags.BlendEnabled;
        }
        const cmask: ArrayLike<boolean> = gl.getParameter(gl.COLOR_WRITEMASK);
        if (!cmask[0]) ret |= GLStateFlags.ColorRedWriteDisabled;
        if (!cmask[1]) ret |= GLStateFlags.ColorGreenWriteDisabled;
        if (!cmask[2]) ret |= GLStateFlags.ColorBlueWriteDisabled;
        if (!cmask[3]) ret |= GLStateFlags.ColorAlphaWriteDisabled;
        if (gl.getParameter(gl.CULL_FACE)) {
            ret |= GLStateFlags.CullFaceEnabled;
        }
        if (gl.getParameter(gl.FRONT_FACE) == gl.CW) {
            ret |= GLStateFlags.FrontFaceCW;
        }
        if (gl.getParameter(gl.SCISSOR_TEST)) {
            ret |= GLStateFlags.ScissorTestEnabled;
        }
        if (gl.getParameter(gl.STENCIL_WRITEMASK) ||
            gl.getParameter(gl.STENCIL_BACK_WRITEMASK)) {
            ret |= GLStateFlags.StencilWriteEnabled;
        }

        return ret;
    }
}

class VertexAttribArraySaver
{
    private binding: WebGLBuffer;
    public enabled: boolean;
    private size: number;
    private stride: number;
    private type: number;
    private normalized: boolean;
    private constants: Float32Array;
    private offset: number;

    constructor(private gl: WebGLRenderingContext, public idx: number)
    {
        this.binding = null;
        this.enabled = false;
        this.size = 0;
        this.stride = 0;
        this.type = 0;
        this.normalized = false;
        this.constants = null;
        this.offset = 0;
    }

    setup(): void
    {
        const {gl, idx} = this;
        this.binding = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
        this.enabled = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        this.size = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_SIZE);
        this.stride = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_STRIDE);
        this.type = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_TYPE);
        this.normalized = gl.getVertexAttrib(idx, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED);
        this.constants = gl.getVertexAttrib(idx, gl.CURRENT_VERTEX_ATTRIB);
        this.offset = gl.getVertexAttribOffset(idx, gl.VERTEX_ATTRIB_ARRAY_POINTER);
    }

    unsetup(): void
    {
        const {gl, idx} = this;
        if (this.binding) {
            gl.vertexAttribPointer(idx, this.size, this.type, this.normalized,
                this.stride, this.offset);
        }
        if (this.enabled) {
            gl.enableVertexAttribArray(idx);
        } else {
            gl.disableVertexAttribArray(idx);
        }
    }
}
