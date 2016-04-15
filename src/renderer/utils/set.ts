/// <reference path="../prefix.d.ts" />

export class Set<T>
{
    private map: Map<T, boolean>;

    constructor(from?: T[] | Set<T>)
    {
        this.map = new Map<T, boolean>();
        if (from) {
           this.union(from);
        }
    }

    insert(obj: T): void
    {
        this.map.set(obj, true);
    }

    union(from: T[] | Set<T>): void
    {
        if (from instanceof Array) {
            for (const e of from) {
                this.map.set(e, true);
            }
        } else if (from instanceof Set) {
            from.map.forEach((value, key) => this.map.set(key, value));
        }
    }

    forEach(cb: (value: T) => void): void
    {
        this.map.forEach((value, key) => cb(key));
    }

    clone(): Set<T>
    {
        return new Set<T>(this);
    }

    has(obj: T): boolean
    {
        return this.map.get(obj) != null;
    }

    toArray(): T[]
    {
        const ret: T[] = [];
        this.map.forEach((value, key) => ret.push(key));
        return ret;
    }
}
