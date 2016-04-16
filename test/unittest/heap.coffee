"use strict"
{assert} = require "chai"
{Heap} = require "../../dist/renderer/utils/heap"

class OverlapChecker
  constructor: (@heap) ->
    @list = []
    @history = []
    return
  get: (size) ->
    region = @heap.get size
    if region?
      {offset, length} = region
      for e in @list
        if offset < e.offset + e.length and offset + length > e.offset
          assert false, "Allocated region [#{offset}:#{length}] overlaps with " +
            "the existing one [#{e.offset}:#{e.length}]"
      @list.push
        offset: offset, length: length, reg: region
      @history.push 
        type: "get", offset: offset, length: length
    region
  release: (region) ->
    unless region?
      assert false, "bug in test case: region is null"
    @history.push 
      type: "release", offset: region.offset, length: region.length
    i = 0
    while i < @list.length
      if @list[i].reg is region
        assert.equal @list[i].offset, region.offset, "region.offset has changed"
        assert.equal @list[i].length, region.length, "region.length has changed"
        @list.splice i, 1
        @heap.release region
        return
      i += 1
    assert false, "bug in the test case: double release"
  dump_history: () ->
    return JSON.stringify @history, null, 2

describe "Heap", () ->

  it "can get exhausted", () ->
    heap = new Heap
    checker = new OverlapChecker(heap)
    heap.resize 1000
    for i in [0..100]
      return unless checker.get 10
    assert false, "heap is bottomless"
    return

  it "releasing reclaims the memory", () ->
    heap = new Heap
    checker = new OverlapChecker(heap)
    heap.resize 1000
    r = checker.get 1000
    assert.isOk r, "allocation failed"
    checker.release r
    r = checker.get 1000
    assert.isOk r, "allocation failed"
    return

  runPattern = (pat) ->
    heap = new Heap
    checker = new OverlapChecker(heap)
    mp = new Map
    heap.resize 1000
    for e in pat
      if e > 0
        r = checker.get(e)
        assert false, "allcation of size #{e} has failed"
        mp.set e, r
      else
        checker.release mp.get(-e)
        mp.delete -e
    return

  it "should not allocate overlapped regions", () ->
    runPattern 200, 300, 400, -200, 50, -300, 80, -400
    return

  it "passes stress test", () ->
    heap = new Heap
    checker = new OverlapChecker(heap)
    mp = new Map
    heap.resize 1000
    regs = []
    for i in [0 .. 1000]
      r = checker.get(1 + Math.random() * 50 | 0)
      unless r
        # exhaused; release one
        if regs.length == 0
          assert false, "allocation failed without any allocated region. " + checker.dump_history()
        r = regs.splice(Math.random() * regs.length | 0, 1)
        checker.release r[0]
      else
        regs.push r
    return

  return
