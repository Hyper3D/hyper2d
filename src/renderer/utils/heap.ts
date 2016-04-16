
import { ObjectPool } from "./pool";
import {
    ulog2,
    countTrailingZeroBits
} from "./math";

/** Memory allocator based on the TLSF algorithm.
 * 
 * Based on:
 * Masmano, Miguel, et al. "TLSF: A new dynamic memory allocator for real-time systems." 
 * Real-Time Systems, 2004. ECRTS 2004. Proceedings. 16th Euromicro Conference on. IEEE, 2004.
 */
export class Heap
{
    private capacity: number;

    // first level
    private flBitmap: number;
    private slMaps: SecondLevelMap[];

    private lastRegion: HeapRegionImpl;

    constructor()
    {
        this.flBitmap = 0;
        const slMaps: SecondLevelMap[] = this.slMaps = [];
        for (let i = 0; i < 32; ++i) {
            slMaps.push(null);
        }
        this.lastRegion = null;
        this.capacity = 0;
    }

    resize(newCapacity: number): void
    {
        const {capacity, lastRegion} = this;
        if (newCapacity < capacity) {
            throw new Error("cannot shrink");
        }

        if (!lastRegion) {
            // initial region
            const r = heapRegionPool.get();
            r.offset = 0;
            r.size = newCapacity
                | RegionFlags.Free | RegionFlags.LastPhysical;
            r.prevPhys = null;
            r.nextPhys = null;
            this.lastRegion = r;
            this.insertFreeRegion(r, computeMapping(newCapacity));
        } else if (lastRegion.size & RegionFlags.Free) {
            // first, remove the region
            this.removeFreeRegion(lastRegion, computeMapping(
                lastRegion.size & RegionFlags.SizeMask));

            // expand the free region
            lastRegion.size += newCapacity - capacity;

            // reinsert
            this.insertFreeRegion(lastRegion, computeMapping(
                lastRegion.size & RegionFlags.SizeMask));
        } else {
            // free region is created
            const r = heapRegionPool.get();
            r.offset = capacity;
            r.size = newCapacity - capacity
                | RegionFlags.Free | RegionFlags.LastPhysical;
            r.prevPhys = lastRegion;
            r.nextPhys = null;
            lastRegion.nextPhys = r;
            lastRegion.size &= ~RegionFlags.LastPhysical;
            this.lastRegion = r;
            this.insertFreeRegion(r, computeMapping(
                r.size & RegionFlags.SizeMask));
        }

        this.capacity = newCapacity;
    }

    get(size: number): HeapRegion
    {
        // find the free block (best-fit)
        const mapping = computeMapping(size);
        const fl = mapping & 0xffff, sl = mapping >> 16;
        const {flBitmap, slMaps} = this;
        let flBitmapShifted = flBitmap >> fl;
        if (flBitmapShifted === 0) {
            // not found
            return null;
        }
        let flOffs = countTrailingZeroBits(flBitmapShifted);
        let flFound = flOffs + fl;
        let slm = slMaps[flFound];
        let slFound: number;
        let {bitmap: slBitmap} = slm;
        if (flOffs === 0) {
            let slBitmapShifted = slBitmap >> sl;
            if (slBitmapShifted) {
                if (slBitmapShifted & 1) {
                    if ((slm.heads[sl].size & RegionFlags.SizeMask) < size) {
                        // too small
                        slBitmapShifted >>>= 1;
                        slFound = slBitmapShifted ?
                            countTrailingZeroBits(slBitmapShifted) + sl + 1 : 32;
                    } else {
                        slFound = sl;
                    }
                } else {
                    slFound = countTrailingZeroBits(slBitmapShifted) + sl;
                }
            } else {
                slFound = 32;
            }
            if (slFound === 32) {
                // check next SecondLevelMap
                flBitmapShifted >>= 1;
                if (flBitmapShifted === 0) {
                    // not found
                    return null;
                }
                flOffs = countTrailingZeroBits(flBitmapShifted);
                flFound = flOffs + fl + 1;
                slm = slMaps[flFound];
                slBitmap = slm.bitmap;
                slFound = countTrailingZeroBits(slBitmap);
            }   
        } else {
            slFound = countTrailingZeroBits(slBitmap);
        }

        // remove the free block from the free list
        // (this could be optimized)
        let region = slm.heads[slFound];
        this.removeFreeRegion(region, flFound | (slFound << 16));

        if ((region.size & RegionFlags.SizeMask) > size) {
            // split the block.
            const newRegion = heapRegionPool.get();
            newRegion.size = size;
            newRegion.offset = region.offset;
            newRegion.prevPhys = region.prevPhys;
            newRegion.nextPhys = region;
            if (region.prevPhys) {
                region.prevPhys.nextPhys = newRegion;
            }

            region.offset += size;
            region.size -= size;
            region.prevPhys = newRegion;

            this.insertFreeRegion(region, computeMapping(
                region.size & RegionFlags.SizeMask));

            return newRegion;
        } else {
            // use entire the block
            region.size &= ~RegionFlags.Free;
            return region;
        }
    }

    release(region: HeapRegion): void
    {
        const r = <HeapRegionImpl> region;

        // try merging
        const {prevPhys} = r;
        if (prevPhys && (prevPhys.size & RegionFlags.Free)) {
            // merge successful
            let {size} = prevPhys;
            size &= RegionFlags.SizeMask;
            r.size = (r.size + size) | RegionFlags.Free;
            r.offset -= size;
            r.prevPhys = prevPhys.prevPhys;
            if (r.prevPhys) {
                r.prevPhys.nextPhys = r;
            }
            this.removeFreeRegion(prevPhys, computeMapping(
                prevPhys.size & RegionFlags.SizeMask));
            heapRegionPool.release(prevPhys);
        } else {
            r.size |= RegionFlags.Free;
        }

        const {nextPhys} = r;
        if (nextPhys && (nextPhys.size & RegionFlags.Free)) {
            let {size} = nextPhys;
            size &= RegionFlags.SizeMask;
            r.size += size;
            r.nextPhys = nextPhys.nextPhys;
            if (r.nextPhys) {
                r.nextPhys.prevPhys = r;
            }
            this.removeFreeRegion(nextPhys, computeMapping(
                nextPhys.size & RegionFlags.SizeMask));
            heapRegionPool.release(nextPhys);
        }

        this.insertFreeRegion(r, computeMapping(
            r.size & RegionFlags.SizeMask));
    }

    private insertFreeRegion(region: HeapRegionImpl, mapping: number): void 
    {
        const fl = mapping & 0xffff;
        const sl = mapping >> 16;
        const {slMaps} = this;
        let slm = slMaps[fl];
        if (slm == null) {
            slm = secondLevelMapPool.get();
            slMaps[fl] = slm;
            this.flBitmap |= 1 << fl;
        }
        const {heads} = slm;
        let e = heads[sl];
        if (e) {
            region.nextFree = e;
            region.prevFree = e.prevFree;
            e.prevFree = region;
            region.prevFree.nextFree = region;
        } else {
            heads[sl] = region;
            region.nextFree = region.prevFree = region;
            slm.bitmap |= 1 << sl;
        }
    }
    private removeFreeRegion(region: HeapRegionImpl, mapping: number): void 
    {
        const fl = mapping & 0xffff;
        const sl = mapping >> 16;
        const {slMaps} = this;
        const slm = slMaps[fl];
        const {heads} = slm;
        if (region.nextFree === region) {
            slm.heads[sl] = null;
            let {bitmap} = slm;
            bitmap &= ~(1 << sl);
            slm.bitmap = bitmap;
            if (bitmap === 0) {
                secondLevelMapPool.release(slm);
                slMaps[fl] = null;
                this.flBitmap &= ~(1 << fl);
            }
        } else {
            if (heads[sl] === region) {
                heads[sl] = region.nextFree;
            }
            region.prevFree.nextFree = region.nextFree;
            region.nextFree.prevFree = region.prevFree;
        }
        region.nextFree = region.prevFree = null;
    }

}

export interface HeapRegion
{
    offset: number;
    length: number;
}

const enum Consts
{
    SecondLevelSizeBits = 4,
    SecondLevelSize = 1 << SecondLevelSizeBits
}

const enum RegionFlags
{
    Free = 1 << 30,
    LastPhysical = 1 << 31,
    SizeMask = 0x3fffffff
}

function computeMapping(size: number): number
{
    const fl = ulog2(size);
    let sl = (size ^ (1 << fl));
    if (fl >= Consts.SecondLevelSizeBits) {
        sl >>= fl - Consts.SecondLevelSizeBits;
    } else {
        sl <<= Consts.SecondLevelSizeBits - fl;
    }
    return fl | (sl << 16);
}

class SecondLevelMap
{
    bitmap: number;
    heads: HeapRegionImpl[];

    constructor()
    {
        this.bitmap = 0;
        const heads: HeapRegionImpl[] = this.heads = [];
        for (let i = 0; i < Consts.SecondLevelSize; ++i) {
            heads.push(null);
        }
    }
}

class HeapRegionImpl implements HeapRegion
{
    offset: number;
    size: number; // also contains RegionFlags

    prevPhys: HeapRegionImpl;
    nextPhys: HeapRegionImpl;
    prevFree: HeapRegionImpl;
    nextFree: HeapRegionImpl;

    constructor()
    {
        this.offset = 0;
        this.size = 0;
        this.prevPhys = null;
        this.nextPhys = null;
        this.prevFree = null;
        this.nextFree = null;
    }

    get length(): number
    {
        return this.size & RegionFlags.SizeMask;
    }
}

const heapRegionPool = new ObjectPool<HeapRegionImpl>(() => new HeapRegionImpl());
const secondLevelMapPool = new ObjectPool<SecondLevelMap>(() => new SecondLevelMap());
