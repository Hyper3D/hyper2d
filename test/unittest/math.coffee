"use strict"
{assert} = require "chai"
{ulog2, countTrailingZeroBits} = require "../../dist/renderer/utils/math"

describe "ulog2", () ->
  for i in [0 ... 32]
    do (i) ->
      it "can return #{i} correctly", () ->
        baseval = 1 << i
        assert.equal ulog2(baseval), i, 
          "ulog2(1 << #{i}) == #{i}"
        if i > 0
          assert.equal ulog2(baseval + 1 | 0), i, 
            "ulog2((1 << #{i}) + 1) == #{i}"
        assert.equal ulog2((baseval << 1) - 1 | 0), i, 
          "ulog2((#(1 << #{i}) << 1) - 1) == #{i}"

describe "countTrailingZeroBits", () ->
  for i in [0 ... 32]
    do (i) ->
      it "can return #{i} correctly", () ->
        baseval = 1 << i
        assert.equal countTrailingZeroBits(baseval), i, 
          "countTrailingZeroBits(1 << #{i}) == #{i}"
        assert.equal countTrailingZeroBits(baseval | (baseval << 1)), i, 
          "countTrailingZeroBits(3 << #{i}) == #{i}"
        assert.equal countTrailingZeroBits(baseval | 0x80000000), i, 
          "countTrailingZeroBits(1 << #{i} | 0x80000000) == #{i}"

