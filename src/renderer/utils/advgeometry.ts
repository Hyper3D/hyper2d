
import {
    Vector2Like,
    Matrix3Like,
    matrix3Pool
} from "./geometry";

export function computeBoundingBoxForLine(
    x1: number, y1: number, x2: number, y2: number,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    outMin.x = Math.min(x1, x2);
    outMin.y = Math.min(y1, y2);
    outMax.x = Math.max(x1, x2);
    outMax.y = Math.max(y1, y2);
}

// Bezier-related routines are based on the excellent writing about
// bezier curves: Pomax, "A Primer on Bézier Curves."
// https://pomax.github.io/bezierinfo/

// we use these to pass multiple computation results without
// doing dynamic allocations
let tempMinValue = 0;
let tempMaxValue = 0;

function computeRangeOf1DBezier2(x1: number, x2: number, x3: number): void
{
    tempMinValue = Math.min(x1, x3);
    tempMaxValue = Math.max(x1, x3);

    if (x1 == x2 || x3 == x2) {
        return;
    }

    const t = (x1 - x2) / (x1 + x3 - x2 * 2);
    if (t > 0 && t < 1) {
        const mt = 1 - t;
        const x = x1 * mt * mt + x2 * mt * t * 2 + x3 * t * t;
        tempMinValue = Math.min(tempMinValue, x);
        tempMaxValue = Math.max(tempMaxValue, x);
    }
}

function computeRangeOf1DBezier3(x1: number, x2: number, x3: number, x4: number): void
{
    tempMinValue = Math.min(x1, x4);
    tempMaxValue = Math.max(x1, x4);

    const a = 3 * (-x1 + 3 * (x2 - x3) + x4);
    const b = 6 * (x1 - 2 * x2 + x3);
    const c = 3 * (x2 - x1);

    if (a == 0) {
        // linear
        if (b == 0) {
            // constant
            return;
        }

        // 0 = bt + c; t = -c / b
        const t = -c / b;
        if (t > 0 && t < 1) {
            const mt = 1 - t;
            const x = x1 * mt * mt * mt + x2 * mt * mt * t * 3 + x3 * mt * t * t + x4 * t * t * t;
            tempMinValue = Math.min(tempMinValue, x);
            tempMaxValue = Math.max(tempMaxValue, x);
        }
    } else {
        // apply the quadratic formula
        const d = b * b - 4 * a * c;
        if (d < 0) {
            // no roots
            return;
        }

        let rd = Math.sqrt(d);

        const t1 = (-b - rd) / (2 * a);
        const t2 = (-b + rd) / (2 * a);

        if (t1 > 0 && t1 < 1) {
            const t = t1, mt = 1 - t;
            const x = x1 * mt * mt * mt + x2 * mt * mt * t * 3 + x3 * mt * t * t * 3 + x4 * t * t * t;
            tempMinValue = Math.min(tempMinValue, x);
            tempMaxValue = Math.max(tempMaxValue, x);
        }
        if (t2 > 0 && t2 < 1) {
            const t = t2, mt = 1 - t;
            const x = x1 * mt * mt * mt + x2 * mt * mt * t * 3 + x3 * mt * t * t * 3 + x4 * t * t * t;
            tempMinValue = Math.min(tempMinValue, x);
            tempMaxValue = Math.max(tempMaxValue, x);
        }
    }
}


export function computeBoundingBoxForBezier2(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    computeRangeOf1DBezier2(x1, x2, x3);
    outMin.x = tempMinValue;
    outMax.x = tempMaxValue;

    computeRangeOf1DBezier2(y1, y2, y3);
    outMin.y = tempMinValue;
    outMax.y = tempMaxValue;
}

export function computeBoundingBoxForBezier3(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    computeRangeOf1DBezier3(x1, x2, x3, x4);
    outMin.x = tempMinValue;
    outMax.x = tempMaxValue;

    computeRangeOf1DBezier3(y1, y2, y3, y4);
    outMin.y = tempMinValue;
    outMax.y = tempMaxValue;
}

export function computeBoundingBoxForEllipticArc(
    cx: number, cy: number,
    rx: number, ry: number,
    angle: number,
    startAngle: number, endAngle: number,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    const minAngle = Math.min(startAngle, endAngle);
    const maxAngle = Math.max(startAngle, endAngle);

    const rCos = Math.cos(angle),      rSin = Math.sin(angle);
    const sCos = Math.cos(minAngle), sSin = Math.sin(minAngle);
    const eCos = Math.cos(maxAngle),   eSin = Math.sin(maxAngle);
    const full = maxAngle - minAngle >= Math.PI * 2;
    const large = maxAngle - minAngle >= Math.PI;

    if (!full) {
        // endpoints
        const slx = sCos * rx, sly = sSin * ry;
        const elx = eCos * rx, ely = eSin * ry;
        const sgx = slx * rCos - sly * rSin + cx;
        const sgy = slx * rSin + sly * rCos + cy;
        const egx = elx * rCos - ely * rSin + cx;
        const egy = elx * rSin + ely * rCos + cy;
        outMin.x = Math.min(sgx, egx);
        outMax.x = Math.max(sgx, egx);
        outMin.y = Math.min(sgy, egy);
        outMax.y = Math.max(sgy, egy);
    }

    // Given a point X inside the ellipse, this satisfies:
    //   X = M * X' where |X'| <= 1
    // To find the bounding box of the ellipse, we have to
    // find the smallest b_x, b_y that satisfies the following equation:
    //   -b_x <= X dot A_x <= b_x
    //   -b_y <= X dot A_y <= b_y
    //    A_x = (1 0)^T, A_y = (0 1)^T
    // That is,
    //   -b_x <= (A_x^T M) X' <= b_x
    //   -b_y <= (A_y^T M) X' <= b_y
    // This is actually trivial:
    //    b_x = sqrt( (A_x^T M) (A_x^T M)^T )
    //    b_y = sqrt( (A_y^T M) (A_y^T M)^T )

    let bxx = rx * rCos, bxy = -ry * rSin;
    const bx = Math.sqrt(bxx * bxx + bxy * bxy);
    let byx = rx * rSin, byy = ry * rCos;
    const by = Math.sqrt(byx * byx + byy * byy);

    if (full) {
        outMin.x = cx - bx;
        outMax.x = cx + bx;
        outMin.y = cy - by;
        outMax.y = cy + by;
        return;
    }

    // For elliptic arcs, we need to check whether each minima/maxima point is
    // on the arc.
    //            A_x dot (M * X') = ± b_x
    //                (A_x^T M) X' = ± b_x
    //       (b_x^{-1} A_x^T M) X' = ± 1
    // (b_x^{-1} A_x^T M)^T dot X' = ± 1
    //   (b_x^{-1} M^T A_x) dot X' = ± 1
    // Because |X'| <= 1,
    //          ∓ b_x^{-1} M^T A_x = X'
    const ibx = 1 / bx, iby = 1 / by;
    bxx *= ibx; bxy *= iby;
    byx *= iby; byy *= iby;

    // Check whether each X' is on the arc.
    // (bxx, bxy) for -b_x, (-bxx, -bxy) for +b_x
    // (byx, byy) for -b_y, (-byx, -byy) for +b_y
    const bx1 = (bxx * -sSin + bxy * sCos > 0) != large;
    const bx2 = (bxx * -eSin + bxy * eCos < 0) != large;
    const by1 = (byx * -sSin + byy * sCos > 0) != large;
    const by2 = (byx * -eSin + byy * eCos < 0) != large;
    if ((bx1 && bx2) != large) {
        outMin.x = Math.min(outMin.x, cx - bx);
    }
    if ((bx1 && bx2) == large) {
        outMax.x = Math.max(outMax.x, cx + bx);
    }
    if ((by1 && by2) != large) {
        outMin.y = Math.min(outMin.y, cy - by);
    }
    if ((by1 && by2) == large) {
        outMax.y = Math.max(outMax.y, cy + by);
    }
}

export function evaluateLineSegment(
    x1: number, y1: number, x2: number, y2: number,
    t: number, outPoint: Vector2Like): void
{
    if (t <= 0) {
        outPoint.x = x1; outPoint.y = y1;
    } else if (t >= 1) {
        outPoint.x = x2; outPoint.y = y2;
    } else {
        outPoint.x = x1 + (x2 - x1) * t;
        outPoint.x = x1 + (x2 - x1) * t;
    }
}

export function evaluateLineSegmentDerivative(
    x1: number, y1: number, x2: number, y2: number,
    outVec: Vector2Like): void
{
    outVec.x = x2 - x1;
    outVec.y = y2 - y1;
}

export function evaluateBezier2(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, t: number,
    outPoint: Vector2Like): void
{
    if (t <= 0) {
        outPoint.x = x1; outPoint.y = y1;
    } else if (t >= 1) {
        outPoint.x = x3; outPoint.y = y3;
    } else {
        const mt = 1 - t;
        const c1 = t * t, c2 = t * mt * 2, c3 = mt * mt;
        outPoint.x = x1 * c1 + x2 * c2 + x3 * c3;
        outPoint.y = y1 * c1 + y2 * c2 + y3 * c3;
    }
}

export function evaluateBezier3(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number,
    t: number, outPoint: Vector2Like): void
{
    if (t <= 0) {
        outPoint.x = x1; outPoint.y = y1;
    } else if (t >= 1) {
        outPoint.x = x4; outPoint.y = y4;
    } else {
        const mt = 1 - t;
        const tt = t * t, mtt = mt * mt;
        const c1 = mt * mtt, c2 = 3 * mtt * t, c3 = 3 * tt * mt, c4 = t * tt;
        outPoint.x = x1 * c1 + x2 * c2 + x3 * c3 + x4 * c4;
        outPoint.y = y1 * c1 + y2 * c2 + y3 * c3 + y4 * c4;
    }
}

export function evaluateBezier2Derivative(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, t: number,
    outVec: Vector2Like): void
{
    if (t <= 0) {
        outVec.x = 2 * (x2 - x1);
        outVec.y = 2 * (y2 - y1);
    } else if (t >= 1) {
        outVec.x = 2 * (x3 - x2);
        outVec.y = 2 * (y3 - y2);
    } else {
        const mt = t - 1;
        outVec.x = 2 * (x3 * t - x2 * (t * 2 - 1) + x1 * mt);
        outVec.y = 2 * (y3 * t - y2 * (t * 2 - 1) + y1 * mt);
    }
}


export function evaluateBezier3Derivative(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number,
    t: number, outVec: Vector2Like): void
{
    if (t <= 0) {
        outVec.x = 3 * (x2 - x1);
        outVec.y = 3 * (y2 - y1);
    } else if (t >= 1) {
        outVec.x = 3 * (x4 - x3);
        outVec.y = 3 * (y4 - y3);
    } else {
        const mt = t - 1;
        outVec.x = 3 * (x2 * (3 * t * t - 4 * t + 1) + t * (2 * x3 + t * (x4 - 3 * x3)) - x1 * mt * mt);
        outVec.y = 3 * (y2 * (3 * t * t - 4 * t + 1) + t * (2 * y3 + t * (y4 - 3 * y3)) - y1 * mt * mt);
    }
}

export function evaluateEllipticArc(
    cx: number, cy: number,
    rx: number, ry: number,
    angle: number,
    startAngle: number, endAngle: number,
    t: number,
    outPoint: Vector2Like): void
{
    t = Math.max(0, Math.min(t, 1));

    // local position
    const ptAngle = startAngle + (endAngle - startAngle) * t;
    const lx = Math.cos(ptAngle) * rx;
    const ly = Math.sin(ptAngle) * ry;

    // rotate
    const rCos = Math.cos(angle), rSin = Math.sin(angle);
    outPoint.x = lx * rCos - ly * rSin + cx;
    outPoint.y = lx * rSin + ly * rCos + cy;
}


export function evaluateEllipticArcDerivative(
    cx: number, cy: number,
    rx: number, ry: number,
    angle: number,
    startAngle: number, endAngle: number,
    t: number,
    outVec: Vector2Like): void
{
    t = Math.max(0, Math.min(t, 1));

    // local position
    const angularSpeed = endAngle - startAngle;
    const ptAngle = startAngle + angularSpeed * t;
    const lx = -Math.sin(ptAngle) * angularSpeed * rx;
    const ly = Math.cos(ptAngle) * angularSpeed * ry;

    // rotate
    const rCos = Math.cos(angle), rSin = Math.sin(angle);
    outVec.x = lx * rCos - ly * rSin;
    outVec.y = lx * rSin + ly * rCos;
}


/**
 * @param m Affine transform that transforms
 *          { (x, y) | 0 <= x,y <= 1 } into the OBB.
 * @param outMin Minimum X/Y coordinates are stored to this.
 * @param outMax Maximum X/Y coordinates are stored to this.
 */
export function computeBoundingBoxForOBB(
    m: Matrix3Like,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    const e = m.e;
    const ox = e[6], oy = e[7];
    const dx1 = e[0], dy1 = e[1];
    const dx2 = e[3], dy2 = e[4];
    outMin.x = outMax.x = ox;
    outMin.y = outMax.y = oy;
    if (dx1 > 0) {
        outMax.x += dx1;
    } else {
        outMin.x += dx1;
    }
    if (dx2 > 0) {
        outMax.x += dx2;
    } else {
        outMin.x += dx2;
    }
    if (dy1 > 0) {
        outMax.y += dy1;
    } else {
        outMin.y += dy1;
    }
    if (dy2 > 0) {
        outMax.y += dy2;
    } else {
        outMin.y += dy2;
    }
}

export function computeBoundingBoxForTransformedAABB(
    m: Matrix3Like, inMin: Vector2Like, inMax: Vector2Like,
    outMin: Vector2Like, outMax: Vector2Like): void
{
    const me = m.e;
    const m2 = matrix3Pool.get();
    const m2e = m2.e;
    m2e[0] = me[0] * (inMax.x - inMin.x);
    m2e[1] = me[1] * (inMax.x - inMin.x);
    m2e[3] = me[3] * (inMax.y - inMin.y);
    m2e[4] = me[4] * (inMax.y - inMin.y);
    m2e[6] = me[6] +
        me[0] * inMin.x + me[3] * inMin.y;
    m2e[7] = me[7] +
        me[1] * inMin.x + me[4] * inMin.y;
    computeBoundingBoxForOBB(m2, outMin, outMax);
    matrix3Pool.release(m2);
}

export function computeLengthOfBezier2(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number): number
{
    // http://www.malczak.linuxpl.com/blog/quadratic-bezier-curve-length/
    const ax = x1 + x3 - x2 * 2;
    const ay = y1 + y3 - y2 * 2;
    const bx = 2 * (x2 - x1);
    const by = 2 * (y2 - y1);
    const A = 4 * (ax * ax + ay * ay);
    const B = 4 * (ax * bx + ay * by);
    const C = bx * bx + by * by;
    const Sabc = 2 * Math.sqrt(A + B + C);
    const A2 = Math.sqrt(A);
    const A32 = 2 * A * A2;
    const C2 = 2 * Math.sqrt(C);
    const BA = B / A2;
    return (A32 * Sabc + A2 * B * (Sabc - C2) +
        (4 * C * A - B * B) * Math.log((2 * A2 + BA + Sabc) / (BA + C2))
        ) / (4 * A32);
}

function evaluateBezier2SignedCurvatureInner(
    x2: number, y2: number,
    x3: number, y3: number, t: number): number {
    const dx = x3 - x2 * 2, dy = y3 - y2 * 2;
    let divisor = (dx * dx + dy * dy) * t * t;
    divisor += x2 * x2 + y2 * y2 +
        2 * t * (x2 * dx + y2 * dy);
    divisor = Math.sqrt(divisor);
    divisor = divisor * divisor * divisor;

    return (x2 * y3 - y2 * x3) / divisor;
}

export function evaluateBezier2SignedCurvature(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, t: number): number
{
    return evaluateBezier2SignedCurvatureInner(x2 - x1, y2 - y1, x3 - x1, y3 - y1, t);
}

export function computeMaximumCurvatureOfBezier2(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number): number
{
    x2 -= x1; y2 -= y1; x3 -= x1; y3 -= y1;

    let maxCurve = Math.abs(evaluateBezier2SignedCurvatureInner(x2, y2, x3, y3, 0));
    maxCurve = Math.max(maxCurve, Math.abs(evaluateBezier2SignedCurvatureInner(x2, y2, x3, y3, 1)));

    const dx = x3 - x2 * 2, dy = y3 - y2 * 2;
    const t = (2 * (x2 * x2 + y2 * y2) - (x2 * x3 + y2 * y3)) /
        (dx * dx + dy * dy);

    if (t > 0 && t < 1) {
        maxCurve = Math.max(maxCurve, Math.abs(evaluateBezier2SignedCurvatureInner(x2, y2, x3, y3, t)));
    }

    return maxCurve;
}
