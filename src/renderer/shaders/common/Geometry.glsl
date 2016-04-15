
highp vec2 evaluateBezier2(
	highp vec2 p1, highp vec2 p2, highp vec2 p3, highp float t)
{
	highp vec2 ts = vec2(t, 1. - t);
	highp vec3 coefs = ts.xyy * ts.xxy;
	coefs.y *= 2.;
	return p1 * coefs.z + p2 * coefs.y + p3 * coefs.x;
}

highp vec2 evaluateBezier2Derivative(
	highp vec2 p1, highp vec2 p2, highp vec2 p3, highp float t)
{
	highp float mt = 1. - t;
	return 2. * (p3 * t + p1 * mt - p2 * (t * 2. - 1.));
}

void splitBezier2(highp vec2 p1, highp vec2 p2, highp vec2 p3, highp float t,
	out highp vec2 outA1, out highp vec2 outA2, out highp vec2 outA3,
	out highp vec2 outB1, out highp vec2 outB2, out highp vec2 outB3)
{
	highp vec2 a1 = mix(p1, p2, t), a2 = mix(p2, p3, t);
	highp vec2 b = mix(a1, a2, t);

	outA1 = p1; outA2 = a1; outA3 = b;
	outB1 = b;  outB2 = a2; outB3 = p3;
}

highp float computeLengthOfBezier2(highp vec2 p1, highp vec2 p2, highp vec2 p3)
{
    // http://www.malczak.linuxpl.com/blog/quadratic-bezier-curve-length/
    highp vec2 a = p1 + p3 - p2 * 2.;
    highp vec2 b = 2. * (p2 - p1);
    highp float A = 4. * dot(a, a);
    highp float B = 4. * dot(a, b);
    highp float C = dot(b, b);
    highp float Sabc = 2. * sqrt(A + B + C);
    highp float A2 = sqrt(A);
    highp float A32 = 2. * A * A2;
    highp float C2 = 2. * sqrt(C);
    highp float BA = B / A2;
    return (A32 * Sabc + A2 * B * (Sabc - C2) +
        (4. * C * A - B * B) * log((2. * A2 + BA + Sabc) / (BA + C2))
        ) / (4. * A32);
}



