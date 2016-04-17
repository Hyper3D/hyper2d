
#pragma require Common
#pragma require DataFetch
#pragma require Paint
#pragma require CommandMapping

#pragma parameter c_needsPaint

#pragma uniform u_rootCommandMappingAddress
#pragma uniform u_vertexBuffer

#pragma attribute a_vertexId

attribute float a_vertexId;

uniform float u_rootCommandMappingAddress;

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
	// find command descriptor
	float vertexId = a_vertexId;
	float commandPtr;
	findCommandMapping(u_rootCommandMappingAddress, vertexId, commandPtr);

	DataBlockFetchInfo cmdDescInfo = openDataBlock(commandPtr);
	vec4 cmdDesc[6];
	cmdDesc[0] = readDataBlock(cmdDescInfo, 0.);
	cmdDesc[1] = readDataBlock(cmdDescInfo, 1.);
	cmdDesc[2] = readDataBlock(cmdDescInfo, 2.);
	cmdDesc[3] = readDataBlock(cmdDescInfo, 3.);
	cmdDesc[4] = readDataBlock(cmdDescInfo, 4.);
	cmdDesc[5] = readDataBlock(cmdDescInfo, 5.);

	// vertex fetch
	float baseVtxAddr = cmdDesc[1].z;
	float vtxAddr = baseVtxAddr + vertexId * 2.;
	vec4 vec0 = readVertexBuffer(vtxAddr);
	vec4 vec1 = readVertexBuffer(vtxAddr + 1.);
	vec2 position = vec0.xy;
	float primitiveType = vec0.z;
	vec4 primitiveParams = vec1;

	// Local-to-global transform
	vec2 globalPosition = cmdDesc[0].xy * position.x +
		cmdDesc[0].zw * position.y + cmdDesc[1].xy;

	v_position = vec4(position, globalPosition);

#if c_needsPaint
	// Paint matrix
	float paintCoordSpace = cmdDesc[4].w;
	vec2 paintBasePosition = paintCoordSpace < PaintCoordinateSpaceLocal + 0.5
		? position : globalPosition;
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
	v_primitiveParams = primitiveParams;
	v_primitiveType = primitiveType;

	// Final position
	float layer = cmdDesc[1].w;
	gl_Position = vec4(globalPosition * u_globalCanvasDoubleInvSize - 1.,
		layer, 1.);
	gl_Position.y = -gl_Position.y;

}
