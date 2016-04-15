
// as far as I memorize...
#define M_PI 3.14159265358979323846264338327950288419716939937510

highp float cubeRootPositive(highp float v)
{
	return pow(v, 1. / 3.);
}

highp float cubeRoot(highp float v)
{
	return sign(v) * cubeRootPositive(abs(v));
}

/** solves t^3 + pt + q = 0 using Cardano's method */
highp vec3 solveDepressedCubicRealRoots(highp float p, highp float q, 
	highp float defaultValue, highp float offset)
{
	// http://www.trans4mind.com/personal_development/mathematics/polynomials/cubicAlgebra.htm
	// http://www.nickalls.org/dick/papers/maths/cubic1993.pdf
	if (p == 0.) {
		return vec3(cubeRoot(-q), defaultValue, defaultValue);
	} else if (q == 0.) {
		if (p <= 0.) {
			p = sqrt(-p);
			return vec3(offset, offset + p, offset - p);
		} else {
			return vec3(offset, defaultValue, defaultValue);
		}
	} else {
		highp float q2 = q * 0.5;
		highp float mp33 = p * p * p * (-1. / 27.);
		highp float D = q2 * q2 - mp33;
		if (D < 0.) {
			// three real roots
			highp float r = sqrt(mp33), t = q / (-2. * r);
			highp float phi = acos(clamp(t, -1., 1.));
			highp float crtr = cubeRootPositive(r), t1 = 2. * crtr;
			return vec3(
				cos(phi * (1. / 3.)),
				cos((phi + 2. * M_PI) * (1. / 3.)),
				cos((phi + 4. * M_PI) * (1. / 3.))
			) * t1 + offset;
		} else if (D == 0.) {
        	// three real roots, two of which are equal:
			highp float u1 = cubeRoot(q2);
			return vec3(2. * u1 + offset, offset - u1, defaultValue);
		} else {
        	// one real root
        	highp float sd = sqrt(D);
        	return vec3(cubeRoot(sd - q2) - cubeRoot(sd + q2) + offset,
        		defaultValue, defaultValue);
		}
	}
}