
import { DataFetchShader } from "../common/DataFetch";

export interface VSDrawShader extends DataFetchShader
{
    a_vertexId: number;
    u_rootCommandMappingAddress: number;
}

export interface VSDrawShaderStaticParams
{
    c_needsPaint: boolean;
}
