#pragma require Common
#pragma uniform u_dataSize
#pragma uniform u_data

/** [w, h, 1/w, 1/h] */
uniform highp vec4 u_dataSize;

uniform highp sampler2D u_data;

struct DataBlockFetchInfo
{
    highp vec2 coord;
};

highp vec2 coordForDataBlock(highp float addr)
{
    addr = (addr + 0.5) * u_dataSize.z;
    highp float row = floor(addr);
    highp float col = fract(addr);
    return vec2(col, row * u_dataSize.w);
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
    return texture2D(u_data, info.coord + vec2(offs * u_dataSize.z, 0.));
}
