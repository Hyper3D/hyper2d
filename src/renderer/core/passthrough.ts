import { ContextImpl } from "./context";
import { GLProgramInfo } from "./glshaders";
import { VSPassthroughShader } from "../shaders/basic/VSPassthrough";
import { FSPassthroughShader } from "../shaders/basic/FSPassthrough";

type PassthroughShader = VSPassthroughShader & FSPassthroughShader;

export class PassthroughRenderer
{
    private program: GLProgramInfo<PassthroughShader>;
    private buffer: WebGLBuffer;

    constructor(private ctx: ContextImpl)
    {
        this.program = ctx.shaderManager.getProgram<PassthroughShader>({
            fs: "FSPassthrough", vs: "VSPassthrough"
        });

        this.buffer = null;
    }

    render(textureStage: number, depth?: number,
        minX?: number, minY?: number, maxX?: number, maxY?: number,
        minU?: number, minV?: number, maxU?: number, maxV?: number): void
    {
        const {gl} = this.ctx;

        if (!this.buffer) {
            this.buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            const data = new Uint8Array([
                0, 0, 1, 0, 0, 1, 1, 1
            ]);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        }

        const {program, buffer} = this;

        program.use();

        if (depth == null) depth = 0.5;
        if (minX == null) minX = -1;
        if (maxX == null) maxX = 1;
        if (minY == null) minY = -1;
        if (maxY == null) maxY = 1;
        if (minU == null) minU = 0;
        if (maxU == null) maxU = 1;
        if (minV == null) minV = 0;
        if (maxV == null) maxV = 1;

        gl.uniform1f(program.params.u_depth, depth);
        gl.uniform4f(program.params.u_positionRange,
            (maxX - minX), (maxY - minY), minX, minY);
        gl.uniform4f(program.params.u_textureCoordRange,
            (maxU - minU), (maxV - minV), minU, minV);
        gl.uniform1i(program.params.u_texture, textureStage);

        gl.enableVertexAttribArray(program.params.a_position);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(program.params.a_position, 2, gl.UNSIGNED_BYTE,
            false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(program.params.a_position);
    }
}
