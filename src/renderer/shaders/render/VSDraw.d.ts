
import { DataFetchShader } from "../common/DataFetch";

export interface VSDrawShader extends DataFetchShader
{
    a_position: number;
    a_primitiveType: number;
    a_commandPtr: number;
    a_primitiveParams: number;
}

export interface VSDrawShaderStaticParams
{
    c_needsPaint: boolean;
}
