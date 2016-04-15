
import { DataFetchShader } from "../common/DataFetch";

export interface FSDrawShader extends DataFetchShader
{
    u_texture: WebGLTexture;
}

export interface FSDrawShaderStaticParams
{
    c_needsPaint: boolean;
}
