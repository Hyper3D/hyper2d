
#pragma require Common
#pragma require DataFetch
#pragma require Paint

#pragma parameter c_needsPaint

#pragma attribute a_position
#pragma attribute a_primitiveType
#pragma attribute a_commandPtr
#pragma attribute a_primitiveParams

attribute vec2 a_position;
attribute float a_primitiveType;
attribute float a_commandPtr;
attribute vec4 a_primitiveParams;

/** Position in the local and global coordinate */
varying vec4 v_position;
varying vec2 v_scissorCoord;
varying vec4 v_primitiveParams;
varying float v_primitiveType;

#if c_needsPaint
varying vec4 v_paintCoord; // local_global_coord, matrix_remainings
varying vec2 v_paintInfo;
varying vec4 v_paintParams;
varying vec4 v_paintMatrix; 
#endif

void main()
{
	DataBlockFetchInfo cmdDescInfo = openDataBlock(a_commandPtr);
	vec4 cmdDesc[6];
	cmdDesc[0] = readDataBlock(cmdDescInfo, 0.);
	cmdDesc[1] = readDataBlock(cmdDescInfo, 1.);
	cmdDesc[2] = readDataBlock(cmdDescInfo, 2.);
	cmdDesc[3] = readDataBlock(cmdDescInfo, 3.);
	cmdDesc[4] = readDataBlock(cmdDescInfo, 4.);
	cmdDesc[5] = readDataBlock(cmdDescInfo, 5.);

	// Local-to-global transform
	vec2 globalPosition = cmdDesc[0].xy * a_position.x +
		cmdDesc[0].zw * a_position.y + cmdDesc[1].xy;

	v_position = vec4(a_position, globalPosition);

#if c_needsPaint
	// Paint matrix
	float paintCoordSpace = cmdDesc[4].w;
	vec2 paintBasePosition = paintCoordSpace < PaintCoordinateSpaceLocal + 0.5
		? a_position : globalPosition;
	v_paintCoord.xy = cmdDesc[3].xy * paintBasePosition.x +
		cmdDesc[3].zw * paintBasePosition.y + cmdDesc[4].xy;
	// Other things
	v_paintInfo.x = cmdDesc[4].z; // paint type
	v_paintInfo.y = paintCoordSpace;
	v_paintParams = cmdDesc[5];
	// Paint matrix
	v_paintCoord.zw = cmdDesc[4].xy;
	v_paintMatrix = cmdDesc[3];
#endif

	// Scissor rect
	v_scissorCoord = globalPosition * cmdDesc[2].xy + cmdDesc[2].zw;

	// Primitive params
	v_primitiveParams = a_primitiveParams;
	v_primitiveType = a_primitiveType;

	// Final position
	float layer = cmdDesc[1].w;
	gl_Position = vec4(globalPosition * u_globalCanvasDoubleInvSize - 1.,
		layer, 1.);
	gl_Position.y = -gl_Position.y;

}
