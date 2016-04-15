/// <reference path="../prefix.d.ts" />

import { Set } from "../utils/set";

import { shaderChunks } from "../shaders/shaderchunks";

export class GLShaderManager
{
    private map: Map<string, GLProgramInfo<any>>;
    private globals: GlobalUniformManager;

    constructor(public gl: WebGLRenderingContext)
    {
        this.globals = new GlobalUniformManager();
        this.map = new Map<string, GLProgramInfo<any>>();
    }

    setGlobalUniform(name: string, value1: number, value2?: number,
        value3?: number, value4?: number): void
    {
        this.globals.setGlobalUniform(name, value1, value2, value3, value4);
    }

    getProgram<T>(opts: GLProgramOptions): GLProgramInfo<T>
    {
        const keyParts: string[] = [opts.fs, "\0", opts.vs];

        if (opts.staticParams) {
            const params: { name: string; value: any; }[] = [];
            for (const name in opts.staticParams) {
                params.push({ name: name, value: opts.staticParams[name] });
            }
            params.sort((a, b) => a.name.localeCompare(b.name));

            for (const e of params) {
                keyParts.push("\0");
                keyParts.push(e.name);
                keyParts.push("\0");
                keyParts.push(JSON.stringify(e.value));
            }
        }

        const key = keyParts.join("");

        let prog = this.map.get(key);
        if (!prog) {
            this.map.set(key, prog = this.createProgram<T>(opts));
        }

        return prog;
    }

    private createProgram<T>(opts: GLProgramOptions): GLProgramInfo<T>
    {
        const gl = this.gl;

        const mainVS = shaderChunks[opts.vs];
        const mainFS = shaderChunks[opts.fs];

        if (!mainVS) {
            throw new Error(`vertex shader chunk ${opts.vs} not found.`);
        }
        if (!mainFS) {
            throw new Error(`fragment shader chunk ${opts.fs} not found.`);
        }

        const ppVS = preprocessChunks(mainVS);
        const ppFS = preprocessChunks(mainFS);

        const uniforms = ppVS.uniforms;
        uniforms.union(ppFS.uniforms);

        const attributes = ppVS.attributes;
        attributes.union(ppFS.attributes);

        const parameters = ppVS.parameters;
        parameters.union(ppFS.parameters);

        const paramParts: string[] = [];
        const paramMap = opts.staticParams || {};
        parameters.forEach((paramName) => {
            const paramValue = paramMap[paramName];
            if (paramValue == null) {
                throw new Error(`parameter value for ${paramName} is not provided`);
            }
            paramParts.push(`#define ${paramName} `);

            if (paramValue === true) {
                paramParts.push("1\n");
            } else if (paramValue === false) {
                paramParts.push("0\n");
            } else {
                paramParts.push(`${paramValue}\n`);
            }
        });
        const paramCode = paramParts.join("");

        let vs: GLShader = null;
        let fs: GLShader = null;
        let prg: GLProgram = null;

        try {
            vs = GLShader.compile(gl, gl.VERTEX_SHADER,
                paramCode + ppVS.source);
            fs = GLShader.compile(gl, gl.FRAGMENT_SHADER,
                paramCode + ppFS.source);

            prg = GLProgram.build(gl, [vs.handle, fs.handle]);

            gl.useProgram(prg.handle);

            const dynParams: any = {};
            uniforms.forEach((uniformName) => {
                dynParams[uniformName] =  gl.getUniformLocation(prg.handle, uniformName);
            });
            attributes.forEach((attributeName) => {
                dynParams[attributeName] =  gl.getAttribLocation(prg.handle, attributeName);
            });

            const info = new GLProgramInfoImpl(prg, dynParams, this.globals);
            prg = null;

            return info;

        } finally {
            if (vs) {
                vs.dispose();
            }
            if (fs) {
                fs.dispose();
            }
            if (prg) {
                prg.dispose();
            }
        }

    }
}

export interface GLProgramOptions
{
    fs: string;
    vs: string;
    staticParams?: { [name: string]: any };
}

export interface GLProgramInfo<T>
{
    params: T;
    program: GLProgram;
    use(): void;
}

class GLProgramInfoImpl<T> implements GLProgramInfo<T>
{
    private globalSetter: GlobalUniformSetter;

    constructor(
        public program: GLProgram,
        public params: T,
        globals: GlobalUniformManager)
    {
        this.globalSetter = new GlobalUniformSetter(globals);
    }

    use(): void
    {
        this.program.gl.useProgram(this.program.handle);
        this.globalSetter.update(this.program);
    }
}

class GlobalUniformManager
{
    structure: string[];
    private structureIndex: {[name: string]: number};
    values: number[][];
    valueGeneration: {};

    constructor()
    {
        this.structure = [];
        this.structureIndex = {};
        this.values = [];
        this.valueGeneration = {};
    }

    setGlobalUniform(name: string, value1: number, value2?: number,
        value3?: number, value4?: number): void
    {
        this.valueGeneration = {};

        const idx = this.structureIndex[name];
        if (idx == null) {
            this.structureIndex[name] = this.structure.length;
            this.structure.push(name);
            const newarr = value4 != null ? [value1, value2, value3, value4] :
                value3 != null ? [value1, value2, value3] :
                value2 != null ? [value1, value2] : [value1];
            this.values.push(newarr);
            return;
        }

        const arr = this.values[idx];
        arr[0] = value1;
        if (arr.length === 1) {
            return;
        }
        arr[1] = value2;
        if (arr.length === 2) {
            return;
        }
        arr[2] = value3;
        if (arr.length === 3) {
            return;
        }
        arr[3] = value4;
    }
}

class GlobalUniformSetter
{
    private valueGeneration: {};
    private uniforms: WebGLUniformLocation[];

    constructor(private manager: GlobalUniformManager)
    {
        this.valueGeneration = null;
        this.uniforms = [];
    }

    update(program: GLProgram): void
    {
        const {gl, handle} = program;
        const {manager, uniforms} = this;
        // (assuming gl.useProgram is already called...)

        if (this.valueGeneration === manager.valueGeneration) {
            return;
        }

        const {structure, values} = manager;
        while (structure.length > uniforms.length) {
            // Uniforms added.
            uniforms.push(gl.getUniformLocation(handle, structure[uniforms.length]));
        }

        for (let i = 0; i < uniforms.length; ++i) {
            const uniform = uniforms[i];
            if (uniform) {
                const value = values[i];
                switch (value.length) {
                    case 1:
                        gl.uniform1f(uniform, value[0]);
                        break;
                    case 2:
                        gl.uniform2f(uniform, value[0], value[1]);
                        break;
                    case 3:
                        gl.uniform3f(uniform, value[0], value[1], value[2]);
                        break;
                    case 4:
                        gl.uniform4f(uniform, value[0], value[1], value[2], value[3]);
                        break;
                }
            }
        }

        this.valueGeneration = manager.valueGeneration;
    }
}

export class GLProgram
{
    constructor(
        public gl: WebGLRenderingContext,
        public handle: WebGLProgram)
    {
    }

    static build(gl: WebGLRenderingContext, shaders: WebGLShader[]): GLProgram
    {
        let program = new GLProgram(gl, gl.createProgram());
        try {
            for (const shader of shaders) {
                gl.attachShader(program.handle, shader);
            }
            gl.linkProgram(program.handle);

            if (!gl.getProgramParameter(program.handle, gl.LINK_STATUS)) {
                const log = gl.getProgramInfoLog(program.handle);
                throw new Error("program link failed: " + log);
            }

            const ret = program;
            program = null;
            return ret;
        } finally {
            if (program != null) {
                program.dispose();
            }
        }
    }

    dispose(): void
    {
        // FIXME: no longer needed; we'll rely on GC
        this.gl.deleteProgram(this.handle);
    }
}

export class GLShader
{
    constructor(
        public gl: WebGLRenderingContext,
        public handle: WebGLShader)
    {
    }

    static compile(gl: WebGLRenderingContext, type: number, source: string): GLShader
    {
        let shader = new GLShader(gl, gl.createShader(type));
        try {

            gl.shaderSource(shader.handle, source);
            gl.compileShader(shader.handle);

            if (!gl.getShaderParameter(shader.handle, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(shader.handle);
                throw new Error("shader compilation failed: " + log);
            }

            const ret = shader;
            shader = null;
            return ret;
        } finally {
            if (shader != null) {
                shader.dispose();
            }
        }
    }

    dispose(): void
    {
        this.gl.deleteShader(this.handle);
    }

}

/** Concatenates all depended chunks into a single GLPreprocessedShaderChunk.  */
function preprocessChunks(main: GLShaderChunk): GLPreprocessedShaderChunk
{
    const included = new Set<GLShaderChunk>();
    const sources: string[] = [];

    const ret: GLPreprocessedShaderChunk = {
        parameters: new Set<string>(),
        attributes: new Set<string>(),
        uniforms: new Set<string>(),
        source: null
    };

    function scan(chunk: GLShaderChunk): void
    {
        if (included.has(chunk)) {
            return;
        }
        included.insert(chunk);

        for (const dep of chunk.requires) {
            const depChunk = shaderChunks[dep];
            if (!depChunk) {
                throw new Error(`shader chunk ${dep} was not found.`);
            }
            scan(depChunk);
        }

        sources.push(chunk.source);
        if (chunk.parameters) {
            ret.parameters.union(chunk.parameters);
        }
        if (chunk.attributes) {
            ret.attributes.union(chunk.attributes);
        }
        if (chunk.uniforms) {
            ret.uniforms.union(chunk.uniforms);
        }
    }

    scan(main);

    ret.source = sources.join("\n");
    return ret;
}

interface GLPreprocessedShaderChunk
{
    parameters: Set<string>;
    attributes: Set<string>;
    uniforms: Set<string>;
    source: string;
}

export interface GLShaderChunk
{
    requires?: string[];
    parameters?: string[];
    attributes?: string[];
    uniforms?: string[];
    source?: string;
}

export interface GLShaderChunkMap
{
    [name: string]: GLShaderChunk;
}
