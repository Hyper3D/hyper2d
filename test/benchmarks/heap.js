"use strict";

const Heap = require("../../dist/renderer/utils/heap").Heap;

const heap = new Heap();
heap.resize(1000);
const regs = [];

if (process.argv[2] === "loop") {
    for (let i = 0; i < 3000000; ++i) {
		var sz = 1 + Math.random() * 500 | 0;
		var r = heap.get(sz);
		if (!r) {
			r = regs.splice(Math.random() * regs.length | 0, 1);
			heap.release(r[0]);
		} else {
			regs.push(r);
		}
    }
    return;
}

const Benchmark = require('benchmark');
const benchmarks = require('beautify-benchmark');
const suite = new Benchmark.Suite;
suite.add('allocate small', () => {
	for (let i = 0; i < 5; ++i) {
		regs.push(heap.get(1 + Math.random() * 50 | 0));
	}
	for (let i = 0; i < regs.length; ++i) {
		heap.release(regs[i]);
	}
	regs.length = 0;
})
.add('allocate medium', () => {
	for (let i = 0; i < 5; ++i) {
		regs.push(heap.get(1 + Math.random() * 100 | 0));
	}
	for (let i = 0; i < regs.length; ++i) {
		heap.release(regs[i]);
	}
	regs.length = 0;
})
.add('allocate larse', () => {
	for (let i = 0; i < 5; ++i) {
		regs.push(heap.get(1 + Math.random() * 200 | 0));
	}
	for (let i = 0; i < regs.length; ++i) {
		heap.release(regs[i]);
	}
	regs.length = 0;
})
.on('cycle', (e) => {
    benchmarks.add(e.target);
})
.on('complete', () => {
    benchmarks.log()
})
.run({ async: true });
