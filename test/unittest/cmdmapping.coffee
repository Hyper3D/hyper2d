"use strict"
{assert} = require "chai"
{CommandMappingGenerator} = require "../../dist/renderer/core/cmdmapping"

describe "CommandMappingGenerator", () ->
  for size in [1 .. 30]
    do (size) ->
      it "generates valid mapping for #{size} command(s)", () ->
        gen = new CommandMappingGenerator()
        for i in [0 ... size]
          gen.processOne 10, i * 7 + 5
        gen.finalize()

        f32 = gen.builder.f32
        outCmdDesc = 0
        traverse = (index) ->
          ptr = 0
          for k in [0 .. 100]
            if index < f32[ptr + 1]
              if index < f32[ptr]
                next = f32[ptr + 4]
              else
                next = f32[ptr + 5]
                index -= f32[ptr]
            else
              if index < f32[ptr + 2]
                next = f32[ptr + 6]
                index -= f32[ptr + 1]
              else
                next = f32[ptr + 7]
                index -= f32[ptr + 2]
            if next < 0
              outCmdDesc = -1 - next
              return index
            else
              ptr = next << 2
          assert false, "infinite recursion detected"

        # validate
        for i in [0 ... size]
          expectedCmdDecs = i * 7 + 5

          for k in [0 .. 9]
            outIndex = traverse i * 10 + k
            assert.equal outIndex, k
            assert.equal outCmdDesc, expectedCmdDecs


