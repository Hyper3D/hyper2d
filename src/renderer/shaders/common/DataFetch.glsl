#pragma require Common
#pragma uniform u_dataUVCoef
#pragma uniform u_data

/** [0.5 / w, 0.5 / w / h, 1 / w, 1 / w / h] */
uniform highp vec4 u_dataUVCoef;

uniform highp sampler2D u_data;

struct DataBlockFetchInfo
{
    highp vec2 coord;
};

highp vec2 coordForDataBlock(highp float addr)
{
    // http://qiita.com/YVT/items/c695ab4b3cf7faa93885
    // this might be faster because GPU often has the MAD (multiply-add)
    // instruction.
    return u_dataUVCoef.xy + u_dataUVCoef.zw * addr;
}

DataBlockFetchInfo openDataBlock(highp float addr)
{
	DataBlockFetchInfo info;
	info.coord = coordForDataBlock(addr);
	return info;
}

highp vec4 readData(highp float addr)
{
    return texture2D(u_data, coordForDataBlock(addr));
}

highp vec4 readDataBlock(DataBlockFetchInfo info, highp float offs)
{
    return texture2D(u_data, info.coord + vec2(offs * u_dataUVCoef.z, 0.));
}
