export class ObjectPool<T>
{
    private pool: T[];
    constructor(private factory: () => T)
    {
        this.pool = [];
    }
    get(): T
    {
        return this.pool.pop() || this.factory();
    }
    release(obj: T): void
    {
        this.pool.push(obj);
    }
}
