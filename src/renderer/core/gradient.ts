/// <reference path="../prefix.d.ts" />

import {
    GradientPaint,
    GradientStop
} from "../frontend/paint";

import {
    pack8x2To32f
} from "../utils/pack";

class GradientEncoder
{
    private map: WeakMap<GradientPaint, Float32Array>;

    constructor()
    {
        this.map = new WeakMap<GradientPaint, Float32Array>();
    }

    encode(paint: GradientPaint): Float32Array
    {
        let encoded = this.map.get(paint);
        if (!encoded) {
            this.map.set(paint, encoded = encodeGradient(paint.stops));
        }
        return encoded;
    }
}

export const globalGradientEncoder = new GradientEncoder();

function encodeGradient(stops: GradientStop[]): Float32Array
{
    // Gradient stops are preprocessed by GradientPaint's constructor
    // so that ∀s∈stops (0 <= s.pos <= 1) ∧ |stops| >= 2 ∧
    // stops[0].pos == 0 ∧ stops[stops.length - 1] == 1 ∧
    // sorted_by_pos(stops) ∧ ∀nsN (0 <= n < |s|-2 |- ¬ (s[n].pos ==
    // s[n+1].pos ∧ s[n+1].pos == s[n+2].pos))

    // TODO: deal with step like this:
    // { pos: 0.5, color: A }, { pos: 0.5, color: B }

    const items: number[] = [];
    function branch(start: number, end: number): number
    {
        const index = items.length;
        if (end == start + 1) {
            // leaf
            const stop1 = stops[start].color;
            const stop2 = stops[end].color;
            items.push(pack8x2To32f(stop1.r, stop1.g));
            items.push(pack8x2To32f(stop1.b, stop1.a));
            items.push(pack8x2To32f(stop2.r, stop2.g));
            items.push(pack8x2To32f(stop2.b, stop2.a));
            return index;
        } else {
            // branch
            const mid = (start + end) >> 1;
            const stp = stops[mid];
            items.push(-1);
            items.push(stp.pos);
            items.push(0); // dummy
            items.push(0); // dummy
            items[index + 2] = branch(start, mid) >> 2;
            items[index + 3] = branch(mid, end) >> 2;
            return index;
        }
    }
    branch(0, stops.length - 1);
    return new Float32Array(items);
}
