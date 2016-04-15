#pragma require Common
#pragma attribute a_position
#pragma attribute a_textureCoord
#pragma uniform u_depth
#pragma uniform u_positionRange
#pragma uniform u_textureCoordRange

varying vec2 v_textureCoord;

attribute vec2 a_position;

uniform float u_depth;
uniform vec4 u_positionRange;
uniform vec4 u_textureCoordRange;

void main()
{
	gl_Position = vec4(a_position * u_positionRange.xy + 
		u_positionRange.zw, u_depth, 1.);
	v_textureCoord = a_position * u_textureCoordRange.xy + 
		u_textureCoordRange.zw;
}
