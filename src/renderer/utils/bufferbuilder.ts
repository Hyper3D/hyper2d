
export class BufferBuilder
{
    buffer: ArrayBuffer;
    size: number;

    u8: Uint8Array;
    u16: Uint16Array;
    u32: Uint32Array;
    s8: Int8Array;
    s16: Int16Array;
    s32: Int32Array;
    f32: Float32Array;
    f64: Float64Array;

    constructor()
    {
        this.buffer = new ArrayBuffer(32);
        this.size = 0;
        this.createViews();
    }

    reset(): void
    {
        this.size = 0;
    }

    private createViews(): void
    {
        this.u8 = new Uint8Array(this.buffer);
        this.u16 = new Uint16Array(this.buffer);
        this.u32 = new Uint32Array(this.buffer);
        this.s8 = new Int8Array(this.buffer);
        this.s16 = new Int16Array(this.buffer);
        this.s32 = new Int32Array(this.buffer);
        this.f32 = new Float32Array(this.buffer);
        this.f64 = new Float64Array(this.buffer);
    }

    reserve(requiredCapacity: number)
    {
        let cap = this.buffer.byteLength;
        while (cap < requiredCapacity) {
            cap <<= 1;
        }
        if (cap == this.buffer.byteLength) {
            return;
        }
        const newBuffer = new ArrayBuffer(cap);
        new Uint32Array(newBuffer).set(new Uint32Array(this.buffer,
            0, (this.size + 3) >> 2));
        this.buffer = newBuffer;
        this.createViews();
    }

    clear(): void
    {
        this.size = 0;
    }

    allocate(size: number): number
    {
        const addr = this.size;
        this.reserve(this.size + size);
        this.size += size;
        return addr;
    }
}
