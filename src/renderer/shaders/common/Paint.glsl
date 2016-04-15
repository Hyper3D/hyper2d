#pragma require Common
#pragma require DataFetch
#pragma require Pack

#define PaintTypeSolid              0.
#define PaintTypeLinearGradient     1.
#define PaintTypeRadialGradient     2.
#define PaintTypeTexture            3.

#define GradientSpreadPad           1.
#define GradientSpreadReflect       2.
#define GradientSpreadRepeat        3.

#define GradientInterpolationRGB        1.
#define GradientInterpolationLinearRGB  2.

#define PaintCoordinateSpaceLocal   1.
#define PaintCoordinateSpaceGlobal  2.
#define PaintCoordinateSpaceStroke  3.

mediump vec4 evaluateGradient(
    highp float coord,
    highp vec4 paintParams)
{
    mediump float spread = paintParams.x;
    mediump float interpol = paintParams.y;
    DataBlockFetchInfo gradinfo = openDataBlock(paintParams.w);
    highp float addr = 0.;
    highp float minRange = 0.;
    highp float maxRange = 1.;

    if (spread < GradientSpreadPad + 0.5) {
        // GradientSpreadPad
        coord = clamp(coord, 0., 1.);
    } else if (spread < GradientSpreadReflect + 0.5) {
        // GradientSpreadReflect
        coord = abs(0.5 - fract(coord * 0.5)) * 2.;
    } else {
        // GradientSpreadRepeat
        coord = fract(coord);
    }

    // support up to 2**8 stops
    for (int i = 0; i < 8; ++i) {
        highp vec4 seg = readDataBlock(gradinfo, addr);
        if (seg.x < 0.) {
            // branch
            if (coord < seg.y) {
                maxRange = seg.y;
                addr = seg.z;
            } else {
                minRange = seg.y;
                addr = seg.w;
            }
        } else {
            // leaf
            mediump float fr = (coord - minRange) / (maxRange - minRange);
            mediump vec4 color1 = vec4(unpack8x2From32f(seg.x), unpack8x2From32f(seg.y));
            mediump vec4 color2 = vec4(unpack8x2From32f(seg.z), unpack8x2From32f(seg.w));

            if (interpol < GradientInterpolationRGB + 0.5) {
                // GradientInterpolationRGB
                return mix(color1, color2, fr);
            } else {
                // GradientInterpolationLinearRGB
                color1.xyz *= color1.xyz; color2.xyz *= color2.xyz; // linearize
                mediump vec4 c = mix(color1, color2, fr);
                return vec4(sqrt(c.xyz), c.w);
            }
        }
    }
    return vec4(0.);
}

mediump vec4 evaluatePaint(
    mediump float paintType,
    highp vec2 paintCoord,
    highp vec4 paintParams,
    lowp sampler2D paintTexture)
{
    if (paintType < PaintTypeLinearGradient + 0.5) {
        if (paintType < PaintTypeSolid + 0.5) {
            // PaintTypeSolid
            return paintParams;
        } else {
            // PaintTypeLinearGradient
            return evaluateGradient(paintCoord.x, paintParams);
        }
    } else {
        if (paintType < PaintTypeRadialGradient + 0.5) {
            // PaintTypeRadialGradient
            return evaluateGradient(length(paintCoord), paintParams);
        } else {
            // PaintTypeTexture
            paintCoord = fract(paintCoord);
            paintCoord = paintCoord * paintParams.xy + paintParams.zw;
            return texture2D(paintTexture, paintCoord);
        }
    }
}
