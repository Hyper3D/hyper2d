import { ObjectPool } from "./pool";

export class Vector2 implements Vector2Like
{
    constructor(public x?: number, public y?: number) { }

    add(x: number, y: number): Vector2
    {
        this.x += x; this. y += y; return this;
    }
    addVector(o: Vector2Like): Vector2
    {
        this.x += o.x; this.y += o.y; return this;
    }
    subVector(o: Vector2Like): Vector2
    {
        this.x -= o.x; this.y -= o.y; return this;
    }
    dotVector(o: Vector2Like): number
    {
        return this.x * o.x + this.y * o.y;
    }
    clone(): Vector2
    {
        return new Vector2(this.x, this.y);
    }
    copyFrom(o: Vector2Like): Vector2
    {
        this.x = o.x; this.y = o.y; return this;
    }
    set(x: number, y: number): Vector2
    {
        this.x = x; this.y = y; return this;
    }
    normalize(): Vector2
    {
        const sq = 1 / Math.sqrt(this.x * this.x + this.y * this.y);
        this.x *= sq; this.y *= sq; return this;
    }
    length(): number
    {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    lengthSquared(): number
    {
        return this.x * this.x + this.y * this.y;
    }
    scaleByScalar(s: number): Vector2
    {
        this.x *= s; this.y *= s; return this;
    }
}

export class Vector3 implements Vector3Like
{
    constructor(public x?: number, public y?: number,
        public z?: number) { }

    add(x: number, y: number, z: number): Vector3
    {
        this.x += x; this. y += y; this.z += z; return this;
    }
    addVector(o: Vector3Like): Vector3
    {
        this.x += o.x; this.y += o.y; this.z += o.z; return this;
    }
    subVector(o: Vector3Like): Vector3
    {
        this.x -= o.x; this.y -= o.y; this.z -= o.z; return this;
    }
    dotVector(o: Vector3Like): number
    {
        return this.x * o.x + this.y * o.y + this.z * o.z;
    }
    clone(): Vector3
    {
        return new Vector3(this.x, this.y, this.z);
    }
    copyFrom(o: Vector3Like): Vector3
    {
        this.x = o.x; this.y = o.y; this.z = o.z; return this;
    }
    set(x: number, y: number, z: number): Vector3
    {
        this.x = x; this.y = y; this.z = z; return this;
    }
    transform(m: Matrix4Like): Vector3
    {
        const x = this.x, y = this.y, z = this.z;
        const e = m.e;
        this.x = x * e[0] + y * e[4] + z * e[8] + e[12];
        this.y = x * e[1] + y * e[5] + z * e[9] + e[13];
        this.z = x * e[2] + y * e[6] + z * e[10] + e[14];
        return this;
    }
}

export class Vector4 implements Vector4Like
{
    constructor(public x?: number, public y?: number,
        public z?: number, public w?: number) { }

    add(x: number, y: number, z: number, w: number): Vector4
    {
        this.x += x; this. y += y; this.z += z; this.w += w; return this;
    }
    addVector(o: Vector4Like): Vector4
    {
        this.x += o.x; this.y += o.y; this.z += o.z; this.w += o.w; return this;
    }
    subVector(o: Vector4Like): Vector4
    {
        this.x -= o.x; this.y -= o.y; this.z -= o.z; this.w -= o.w; return this;
    }
    dotVector(o: Vector4Like): number
    {
        return this.x * o.x + this.y * o.y + this.z * o.z + this.w * o.w;
    }
    clone(): Vector4
    {
        return new Vector4(this.x, this.y, this.z, this.w);
    }
    copyFrom(o: Vector4Like): Vector4
    {
        this.x = o.x; this.y = o.y; this.z = o.z; this.w = o.w; return this;
    }
    set(x: number, y: number, z: number, w: number): Vector4
    {
        this.x = x; this.y = y; this.z = z; this.w = w; return this;
    }
    transform(m: Matrix4Like): Vector4
    {
        const x = this.x, y = this.y, z = this.z, w = this.w;
        const e = m.e;
        this.x = x * e[0] + y * e[4] + z * e[8] + w * e[12];
        this.y = x * e[1] + y * e[5] + z * e[9] + w * e[13];
        this.z = x * e[2] + y * e[6] + z * e[10] + w * e[14];
        this.w = x * e[3] + y * e[7] + z * e[11] + w * e[15];
        return this;
    }
}

export class Matrix3 implements Matrix3Like
{
    e: Float32Array;

    constructor(
        m00?: number, m01?: number, m02?: number,
        m10?: number, m11?: number, m12?: number,
        m20?: number, m21?: number, m22?: number)
    {
        const e = this.e = new Float32Array(9);
        if (m00 != null) {
            e[0] = m00;     e[1] = m10;     e[2] = m20;
            e[3] = m01;     e[4] = m11;     e[5] = m21;
            e[6] = m01;     e[7] = m12;     e[8] = m22;
        }
    }

    static identity(): Matrix3
    {
        return new Matrix3(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        );
    }

    static translation(x: number | Vector2Like, y?: number): Matrix3
    {
        return new Matrix3().setTranslation(x, y);
    }

    static scaling(x: number | Vector2Like, y?: number): Matrix3
    {
        return new Matrix3().setScaling(x, y);
    }

    static rotation(angle: number): Matrix3
    {
        return new Matrix3().setRotation(angle);
    }

    setIdentity(): Matrix3
    {
        const e = this.e;
        e[0] = 1; e[1] = 0; e[2] = 0;
        e[3] = 0; e[4] = 1; e[5] = 0;
        e[6] = 0; e[7] = 0; e[8] = 1;
        return this;
    }

    setTranslation(x: number | Vector2Like, y?: number): Matrix3
    {
        if (typeof x !== "number") {
            y = (<Vector2Like> x).y; x = (<Vector2Like> x).x;
        }
        const e = this.e;
        e[0] = 1; e[1] = 0; e[2] = 0;
        e[3] = 0; e[4] = 1; e[5] = 0;
        e[6] = <number> x; e[7] = y; e[8] = 1;
        return this;
    }

    setScaling(x: number | Vector2Like, y?: number): Matrix3
    {
        if (typeof x !== "number") {
            y = (<Vector2Like> x).y; x = (<Vector2Like> x).x;
        } else if (y == null) {
            y = <number> x;
        }
        const e = this.e;
        e[0] = <number> x; e[1] = 0; e[2] = 0;
        e[3] = 0; e[4] = y; e[5] = 0;
        e[6] = 0; e[7] = 0; e[8] = 1;
        return this;
    }

    /** @param angle Rotation angle, measured in CW, radians. */
    setRotation(angle: number): Matrix3
    {
        const e = this.e;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        e[0] = cos; e[1] = sin; e[2] = 0;
        e[3] = -sin; e[4] = cos;  e[5] = 0;
        e[6] = 0;   e[7] = 0;    e[8] = 1;
        return this;
    }

    multiply(o: Matrix3): Matrix3
    {
        const ae = this.e;
        const be = o.e;
        const e = this.e;

        const a00 = ae[0], a01 = ae[3], a02 = ae[6];
        const a10 = ae[1], a11 = ae[4], a12 = ae[7];
        const a20 = ae[2], a21 = ae[5], a22 = ae[8];

        const b00 = be[0], b01 = be[3], b02 = be[6];
        const b10 = be[1], b11 = be[4], b12 = be[7];
        const b20 = be[2], b21 = be[5], b22 = be[8];

        e[0]    = a00 * b00 + a01 * b10 + a02 * b20;
        e[3]    = a00 * b01 + a01 * b11 + a02 * b21;
        e[6]    = a00 * b02 + a01 * b12 + a02 * b22;

        e[1]    = a10 * b00 + a11 * b10 + a12 * b20;
        e[4]    = a10 * b01 + a11 * b11 + a12 * b21;
        e[7]    = a10 * b02 + a11 * b12 + a12 * b22;

        e[2]    = a20 * b00 + a21 * b10 + a22 * b20;
        e[5]    = a20 * b01 + a21 * b11 + a22 * b21;
        e[8]    = a20 * b02 + a21 * b12 + a22 * b22;

        return this;
    }

    copyFrom(o: Matrix3Like): Matrix3
    {
        const {e} = this, {e: oe} = o;
        e[0] = oe[0]; e[1] = oe[1]; e[2] = oe[2];
        e[3] = oe[3]; e[4] = oe[4]; e[5] = oe[5];
        e[6] = oe[6]; e[7] = oe[7]; e[8] = oe[8];
        return this;
    }

    clone(): Matrix3
    {
        return new Matrix3().copyFrom(this);
    }

    transformArrayVector2(a: ArrayLike<number>, i: number): Matrix3
    {
        const x = a[i], y = a[i + 1];
        const e = this.e;
        a[i    ] = x * e[0] + y * e[3] + e[6];
        a[i + 1] = x * e[1] + y * e[4] + e[7];
        return this;
    }

    transformArrayVector3(a: ArrayLike<number>, i: number): Matrix3
    {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const e = this.e;
        a[i    ] = x * e[0] + y * e[3] + z * e[6];
        a[i + 1] = x * e[1] + y * e[4] + z * e[7];
        a[i + 2] = x * e[2] + y * e[5] + z * e[8];
        return this;
    }
}

export class Matrix4 implements Matrix4Like
{
    e: Float32Array;

    constructor(
        m00?: number, m01?: number, m02?: number, m03?: number,
        m10?: number, m11?: number, m12?: number, m13?: number,
        m20?: number, m21?: number, m22?: number, m23?: number,
        m30?: number, m31?: number, m32?: number, m33?: number)
    {
        const e = this.e = new Float32Array(16);
        if (m00 != null) {
            e[0] = m00;     e[1] = m10;     e[2] = m20;     e[3] = m30;
            e[4] = m01;     e[5] = m11;     e[6] = m21;     e[7] = m31;
            e[8] = m01;     e[9] = m12;     e[10] = m22;    e[11] = m32;
            e[12] = m02;    e[13] = m13;    e[14] = m23;    e[15] = m33;
        }
    }

    static identity(): Matrix4
    {
        return new Matrix4(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
    }

    setIdentity(): Matrix4
    {
        for (let i = 0; i < 16; ++i)
            this.e[i] = (i & 3) == (i >> 2) ? 1 : 0;
        return this;
    }

    multiply(o: Matrix4): Matrix4
    {
        const ae = this.e;
        const be = o.e;
        const e = this.e;

        const a00 = ae[0], a01 = ae[4], a02 = ae[8], a03 = ae[12];
        const a10 = ae[1], a11 = ae[5], a12 = ae[9], a13 = ae[13];
        const a20 = ae[2], a21 = ae[6], a22 = ae[10], a23 = ae[14];
        const a30 = ae[3], a31 = ae[7], a32 = ae[11], a33 = ae[15];

        const b00 = be[0], b01 = be[4], b02 = be[8], b03 = be[12];
        const b10 = be[1], b11 = be[5], b12 = be[9], b13 = be[13];
        const b20 = be[2], b21 = be[6], b22 = be[10], b23 = be[14];
        const b30 = be[3], b31 = be[7], b32 = be[11], b33 = be[15];

        e[0]    = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
        e[4]    = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
        e[8]    = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
        e[12]   = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

        e[1]    = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
        e[5]    = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
        e[9]    = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
        e[13]   = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

        e[2]    = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
        e[6]    = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
        e[10]   = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
        e[14]   = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

        e[3]    = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
        e[7]    = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
        e[11]   = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
        e[15]   = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

        return this;
    }

    copyFrom(o: Matrix4Like): Matrix4
    {
        const {e} = this, {e: oe} = o;
        e[0] = oe[0]; e[1] = oe[1]; e[2] = oe[2]; e[3] = oe[3];
        e[4] = oe[4]; e[5] = oe[5]; e[6] = oe[6]; e[7] = oe[7];
        e[8] = oe[8]; e[9] = oe[9]; e[10] = oe[10]; e[11] = oe[11];
        e[12] = oe[12]; e[13] = oe[13]; e[14] = oe[14]; e[15] = oe[15];
        return this;
    }

    clone(): Matrix4
    {
        return new Matrix4().copyFrom(this);
    }

    transformArrayVector3(a: ArrayLike<number>, i: number): Matrix4
    {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const e = this.e;
        a[i    ] = x * e[0] + y * e[4] + z * e[8] + e[12];
        a[i + 1] = x * e[1] + y * e[5] + z * e[9] + e[13];
        a[i + 2] = x * e[2] + y * e[6] + z * e[10] + e[14];
        return this;
    }

    transformArrayVector4(a: ArrayLike<number>, i: number): Matrix4
    {
        const x = a[i], y = a[i + 1], z = a[i + 2], w = a[i + 3];
        const e = this.e;
        a[i    ] = x * e[0] + y * e[4] + z * e[8] + w * e[12];
        a[i + 1] = x * e[1] + y * e[5] + z * e[9] + w * e[13];
        a[i + 2] = x * e[2] + y * e[6] + z * e[10] + w * e[14];
        a[i + 3] = x * e[3] + y * e[7] + z * e[11] + w * e[15];
        return this;
    }
}

export interface Vector2Like
{
    x: number;
    y: number;
}

export interface Vector3Like
{
    x: number;
    y: number;
    z: number;
}

export interface Vector4Like
{
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Matrix3Like
{
    e: ArrayLike<number>;
}

export interface Matrix4Like
{
    e: ArrayLike<number>;
}

export const vector2Pool = new ObjectPool<Vector2>(() => new Vector2());
export const vector3Pool = new ObjectPool<Vector3>(() => new Vector3());
export const vector4Pool = new ObjectPool<Vector4>(() => new Vector4());
export const matrix3Pool = new ObjectPool<Matrix3>(() => new Matrix3());
export const matrix4Pool = new ObjectPool<Matrix4>(() => new Matrix4());
