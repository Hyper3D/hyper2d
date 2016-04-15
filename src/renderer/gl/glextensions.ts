
export function requireExtension<T>(gl: WebGLRenderingContext, name: string): T
{
    const ext = gl.getExtension(name);
    if (!ext) {
        throw new Error(`Required WebGL extension ${name} is not supported.`);
    }
    return ext;
}

export interface WebGLDrawBuffers
{
    COLOR_ATTACHMENT0_WEBGL: number;
    COLOR_ATTACHMENT1_WEBGL: number;
    COLOR_ATTACHMENT2_WEBGL: number;
    COLOR_ATTACHMENT3_WEBGL: number;
    COLOR_ATTACHMENT4_WEBGL: number;
    COLOR_ATTACHMENT5_WEBGL: number;
    COLOR_ATTACHMENT6_WEBGL: number;
    COLOR_ATTACHMENT7_WEBGL: number;
    COLOR_ATTACHMENT8_WEBGL: number;
    COLOR_ATTACHMENT9_WEBGL: number;
    COLOR_ATTACHMENT10_WEBGL: number;
    COLOR_ATTACHMENT11_WEBGL: number;
    COLOR_ATTACHMENT12_WEBGL: number;
    COLOR_ATTACHMENT13_WEBGL: number;
    COLOR_ATTACHMENT14_WEBGL: number;
    COLOR_ATTACHMENT15_WEBGL: number;

    DRAW_BUFFER0_WEBGL: number;
    DRAW_BUFFER1_WEBGL: number;
    DRAW_BUFFER2_WEBGL: number;
    DRAW_BUFFER3_WEBGL: number;
    DRAW_BUFFER4_WEBGL: number;
    DRAW_BUFFER5_WEBGL: number;
    DRAW_BUFFER6_WEBGL: number;
    DRAW_BUFFER7_WEBGL: number;
    DRAW_BUFFER8_WEBGL: number;
    DRAW_BUFFER9_WEBGL: number;
    DRAW_BUFFER10_WEBGL: number;
    DRAW_BUFFER11_WEBGL: number;
    DRAW_BUFFER12_WEBGL: number;
    DRAW_BUFFER13_WEBGL: number;
    DRAW_BUFFER14_WEBGL: number;
    DRAW_BUFFER15_WEBGL: number;

    MAX_COLOR_ATTACHMENTS_WEBGL: number;
    MAX_DRAW_BUFFERS_WEBGL: number;

    drawBuffersWEBGL(buffers: ArrayLike<number>): void;
}

export interface WebGLTimerQueryEXT
{
}

export interface EXTDisjointTimerQuery
{
    QUERY_COUNTER_BITS_EXT: number;
    CURRENT_QUERY_EXT: number;
    QUERY_RESULT_EXT: number;
    QUERY_RESULT_AVAILABLE_EXT: number;
    TIME_ELAPSED_EXT: number;
    TIMESTAMP_EXT: number;
    GPU_DISJOINT_EXT: number;

    createQueryEXT(): WebGLTimerQueryEXT;
    deleteQueryEXT(query: WebGLTimerQueryEXT): void;
    isQueryEXT(query: WebGLTimerQueryEXT): boolean;
    beginQueryEXT(target: number, query: WebGLTimerQueryEXT): void;
    endQueryEXT(target: number): void;
    queryCounterEXT(query: WebGLTimerQueryEXT, target: number): void;
    getQueryEXT(target: number, pname: number): any;
    getQueryObjectEXT(query: WebGLTimerQueryEXT, pname: number): any;
}

export interface OESTextureFloat
{
}

export interface OESTextureHalfFloat
{
    HALF_FLOAT_OES: number;
}

