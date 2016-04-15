
#pragma require Paint
#pragma require Shape

#pragma parameter c_needsPaint

varying highp vec4 v_position;
varying highp vec2 v_scissorCoord;
varying highp vec4 v_primitiveParams;
varying highp float v_primitiveType;

#if c_needsPaint
varying highp vec4 v_paintCoord;
varying mediump vec2 v_paintInfo;
varying highp vec4 v_paintParams;
varying highp vec4 v_paintMatrix;
#endif

#if c_needsPaint
uniform lowp sampler2D u_texture;
#endif

void main()
{
	// Scissor test
	if (floor(v_scissorCoord) != vec2(0.)) {
		discard;
	}

	// Shaping
	highp vec2 strokeCoord;
	bool needsStrokeCoord = false;
#if c_needsPaint
	mediump float paintType = v_paintInfo.x;
	mediump float paintCoordSpace = v_paintInfo.y;
	highp vec2 paintCoord = v_paintCoord.xy;
	if (paintCoordSpace > PaintCoordinateSpaceStroke - .5) {
		needsStrokeCoord = true;
	}
#endif
	if (!evaluateShape(v_primitiveType, v_primitiveParams, v_position.xy, needsStrokeCoord, strokeCoord)) {
		discard;
	}
#if c_needsPaint
	if (needsStrokeCoord) {
		// use stroke coord instead. apply the paint matrix
		paintCoord.xy = v_paintMatrix.xy * strokeCoord.x +
			v_paintMatrix.zw * strokeCoord.y + v_paintCoord.zw;
	}

	gl_FragColor = evaluatePaint(paintType, paintCoord, 
		v_paintParams, u_texture);
	gl_FragColor.xyz *= gl_FragColor.w; // premultiplied alpha
#else
	gl_FragColor = vec4(0.);
#endif
}

