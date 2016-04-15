#pragma require Common
#pragma uniform u_constantColor

uniform mediump vec4 u_constantColor;

void main()
{
    gl_FragColor = u_constantColor;
}