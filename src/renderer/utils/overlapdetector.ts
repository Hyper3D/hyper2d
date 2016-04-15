
export const enum OverlapDetectorMode
{
    HighestLayerIndex = 0,
    OccupiedLayerBitmap
}

/**
 * Stores a collection of rectangles, and when a new item was inserted,
 * it checks whether the new item overlaps with one of the existing items.
 * Detection is fast and conservative; false-positive might occur.
 *
 * <code>OverlapDetector</code> also manages multiple layers in one of two
 * modes: highest layer index and occupied layer bitmap.
 */
export class OverlapDetector
{
    private map: Int32Array;
    private generation: number;
    private cols: number;
    private rows: number;
    private precInv: number;
    private maxX: number;
    private minX: number;
    private maxY: number;
    private minY: number;

    constructor(private width: number, private height: number,
        private precision: number, private mode: OverlapDetectorMode)
    {
        this.cols = Math.ceil(width / precision);
        this.rows = Math.ceil(height / precision);
        this.map = new Int32Array(this.cols * this.rows << 1);
        this.generation = 1;
        this.precInv = 1 / precision;
        this.maxX = this.minX = 0;
        this.maxY = this.minY = 0;
        this.clear();
    }

    clear(): void
    {
        this.generation = (this.generation + 1) | 0;
        if (this.generation == 0) {
            // wrap-around happened; clear in the slow way
            const map = this.map;
            for (let i = 0; i < map.length; i += 2) {
                map[i] = 0;
            }
            this.generation = 1;
        }

        this.maxX = this.maxY = -Infinity;
        this.minX = this.minY = Infinity;
    }

    intersects(x1: number, y1: number, x2: number, y2: number): number
    {
        if (x1 >= this.maxX || y1 >= this.maxY || x2 <= this.minX || y2 <= this.minY) {
            return null;
        }

        x1 = Math.max(0, Math.floor(x1 * this.precInv));
        x2 = Math.min(this.cols, Math.ceil(x2 * this.precInv));
        y1 = Math.max(0, Math.floor(y1 * this.precInv));
        y2 = Math.min(this.rows, Math.ceil(y2 * this.precInv));
        if (x2 <= x1 || y2 <= y1) {
            return null;
        }
        const {map, cols, generation, mode} = this;
        let index = (x1 + y1 * cols) << 1;
        let best = 0;
        switch (mode) {
            case OverlapDetectorMode.HighestLayerIndex: best = -1; break;
            case OverlapDetectorMode.OccupiedLayerBitmap: best = 0; break;
            default: throw new Error("bad OverlapDetectorMode");
        }
        for (let y = y1; y < y2; ++y) {
            switch (mode) {
                case OverlapDetectorMode.HighestLayerIndex:
                    for (let x = x1; x < x2; ++x) {
                        if (map[index] === generation) {
                            if (map[index + 1] > best) {
                                best = map[index + 1];
                            }
                        }
                        index += 2;
                    }
                    break;
                case OverlapDetectorMode.OccupiedLayerBitmap:
                    for (let x = x1; x < x2; ++x) {
                        if (map[index] === generation) {
                            best |= map[index + 1];
                        }
                        index += 2;
                    }
                    break;
            }
            index += (cols - (x2 - x1)) << 1;
        }
        if (best === -1 && mode == OverlapDetectorMode.HighestLayerIndex) {
            return null;
        }
        return best;
    }

    insert(x1: number, y1: number, x2: number, y2: number, layer: number): void
    {
        x1 = Math.max(0, x1); x2 = Math.min(this.width, x2);
        y1 = Math.max(0, y1); y2 = Math.min(this.height, y2);
        if (x2 <= x1 || y2 <= y1) {
            return;
        }
        this.minX = Math.min(this.minX, x1);
        this.minY = Math.min(this.minY, y1);
        this.maxX = Math.max(this.maxX, x2);
        this.maxY = Math.max(this.maxY, y2);

        x1 = Math.max(0, Math.floor(x1 * this.precInv));
        x2 = Math.min(this.cols, Math.ceil(x2 * this.precInv));
        y1 = Math.max(0, Math.floor(y1 * this.precInv));
        y2 = Math.min(this.rows, Math.ceil(y2 * this.precInv));
        if (x2 <= x1 || y2 <= y1) {
            return;
        }
        const {map, cols, generation, mode} = this;
        let index = (x1 + y1 * cols) << 1;
        for (let y = y1; y < y2; ++y) {
            switch (mode) {
                case OverlapDetectorMode.HighestLayerIndex: {
                    for (let x = x1; x < x2; ++x) {
                        if (map[index] === generation) {
                            map[index + 1] = Math.max(map[index + 1], layer);
                        } else {
                            map[index] = generation;
                            map[index + 1] = layer;
                        }
                        index += 2;
                    }
                    break;
                }
                case OverlapDetectorMode.OccupiedLayerBitmap: {
                    for (let x = x1; x < x2; ++x) {
                        if (map[index] === generation) {
                            map[index + 1] = map[index + 1] | layer;
                        } else {
                            map[index] = generation;
                            map[index + 1] = layer;
                        }
                        index += 2;
                    }
                    break;
                }
            }
            index += (cols - (x2 - x1)) << 1;
        }
    }
}
