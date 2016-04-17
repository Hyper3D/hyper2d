#pragma require Common
#pragma require DataFetch
#pragma require Math
#pragma require Geometry

#define PrimitiveTypeSimple				0.
#define PrimitiveTypeQuadraticFill		1.
#define PrimitiveTypeCircle				2.
#define PrimitiveTypeQuadraticStroke	3.

bool evaluateShape(
    mediump float primitiveType,
    highp vec4 primitiveParams,
    highp vec2 localCoord,
    bool needsStrokeCoord,
    out highp vec2 outStrokeCoord)
{
    outStrokeCoord = vec2(0.);
    if (primitiveType < PrimitiveTypeQuadraticFill + .5) {
    	if (primitiveType < PrimitiveTypeSimple + .5) {
    		// PrimitiveTypeSimple
    		outStrokeCoord = primitiveParams.xy;
    		return true;
    	} else {
    		// PrimitiveTypeQuadraticFill
    		highp vec2 uv = primitiveParams.xy;
    		return uv.y >= uv.x * uv.x;
    	}
    } else {
    	if (primitiveType < PrimitiveTypeCircle + .5) {
    		// PrimitiveTypeCircle
    		highp vec2 circleUV = primitiveParams.xy;
    		highp vec2 strokeUV = primitiveParams.zw;
            if (needsStrokeCoord) {
        		if (strokeUV.y > 1.) {
        			outStrokeCoord = vec2(strokeUV.x, circleUV.y * .5 + .5);
        		} else {
        			outStrokeCoord = vec2(strokeUV.x, 
        				length(circleUV) * strokeUV.y + 0.5);
        		}
            }
    		return length(circleUV) < 1.;
    	} else {
    		// PrimitiveTypeQuadraticStroke
            highp vec2 depressedCoefs = primitiveParams.xy;
    		highp float invWdthHalf = primitiveParams.z;
    		highp float qDescPtr = primitiveParams.w;

    		highp vec4 qDesc[3];
    		qDesc[0] = readVertexBuffer(qDescPtr + 0.);
            qDesc[1] = readVertexBuffer(qDescPtr + 1.);
            qDesc[2] = readVertexBuffer(qDescPtr + 2.);

            highp vec2 localOrigin = qDesc[0].xy;
            highp vec2 bezierC2 = qDesc[0].zw;
            highp vec2 bezierC3 = qDesc[1].xy;
            highp float depressedOffs = qDesc[2].x;
            highp vec2 strokeURange = qDesc[1].zw;

            highp vec2 bezierCoord = (localCoord - localOrigin) * invWdthHalf;

            // find nearest "t"s
            highp vec3 ts = solveDepressedCubicRealRoots(depressedCoefs.x, 
                depressedCoefs.y, 2. /* outside of [0, 1] */, depressedOffs);
            bvec3 tsValid = lessThanEqual(abs(ts - 0.5), vec3(0.5));
            highp vec2 nearest[3], tangent[3];
            highp vec3 side;

            if (tsValid.x) {
                highp vec2 nr = nearest[0] = evaluateBezier2(vec2(0.), bezierC2, bezierC3, ts.x);
                highp vec2 tn = tangent[0] = normalize(evaluateBezier2Derivative(vec2(0.), bezierC2, bezierC3, ts.x));
                side.x = dot(bezierCoord - nr, vec2(tn.y, -tn.x));
                if (abs(side.x) > 1.) {
                    tsValid.x = false;
                }
            }
            if (tsValid.y) {
                highp vec2 nr = nearest[1] = evaluateBezier2(vec2(0.), bezierC2, bezierC3, ts.y);
                highp vec2 tn = tangent[1] = normalize(evaluateBezier2Derivative(vec2(0.), bezierC2, bezierC3, ts.y));
                side.y = dot(bezierCoord - nr, vec2(tn.y, -tn.x));
                if (abs(side.y) > 1.) {
                    tsValid.y = false;
                }
            }
            if (tsValid.z) {
                highp vec2 nr = nearest[2] = evaluateBezier2(vec2(0.), bezierC2, bezierC3, ts.z);
                highp vec2 tn = tangent[2] = normalize(evaluateBezier2Derivative(vec2(0.), bezierC2, bezierC3, ts.z));
                side.z = dot(bezierCoord - nr, vec2(tn.y, -tn.x));
                if (abs(side.z) > 1.) {
                    tsValid.z = false;
                }
            }

            if (needsStrokeCoord) {
                side = side * -0.5 + 0.5;
                outStrokeCoord = vec2(2., 0.);
                if (tsValid.x && ts.x < outStrokeCoord.x) {
                    outStrokeCoord = vec2(ts.x, side.x);
                }
                if (tsValid.y && ts.y < outStrokeCoord.x) {
                    outStrokeCoord = vec2(ts.y, side.y);
                }
                if (tsValid.z && ts.z < outStrokeCoord.x) {
                    outStrokeCoord = vec2(ts.z, side.z);
                }
                outStrokeCoord.x = outStrokeCoord.x * strokeURange.y + strokeURange.x;
            }

    		return any(tsValid);
    	}
    }
}

