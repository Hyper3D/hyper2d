#pragma require Common
#pragma uniform u_texture

uniform lowp sampler2D u_texture;

varying highp vec2 v_textureCoord;

void main()
{
    gl_FragColor = texture2D(u_texture, v_textureCoord);
}
