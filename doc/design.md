Design
======

Features
--------

* Hardware accelerated 2D vector graphics
  * Rasterizaton of bezier curves by fragment shader using a technique
    described in Mark J. Kligard, Jeff Bolz, NVIDIA Corporation,
    "*GPU-accelerated Path Rendering*."
  * Reduces the number of draw calls by rendering as many shapes as possible
    in a single draw call
  * Transformations in GPU
* Full-featured vector graphics
  * Nested clipping paths
    * Even strokes can be a part of clipping paths
  * 2D affine transformations
  * Various filling patterns (which can be used for fills as well as strokes)
    * Solid color
    * Gradients (linear, radial, conial)
    * Stroke gradients?
    * Texture fill
  * Full set of stroke options (cap and joint types)
  * Odd/even and non-zero fill rules
  * Antialiasing by adaptive supersampling?
* Drawings can be grouped into *sprites*, which can improve the rendering
  performance by eliminating the recomputation of some vertex data

Concepts
--------

* **Stroke UV**: Coordinates are determined along the stroke path.
  U coordinate starts as 0 at the beginning of the path, and ends as 1 at
  the end of the path. At the left side of the path V coordinate is
  0 and vice versa.

Implementation Concepts
-----------------------

 * **Clipping hierarchy**
 * **Clipping layers** is 1-bit bitmaps, which determine what part of
   the shape is rendered. Layers are stacked and logical AND of all
   clipping layers are used as the clipping mask during the draw operation.
   These are called **active clipping layers**.
 * **Working clipping layer** is a clipping layer that is currently being
   built. After it's built it becomes the topmost active clipping layer
   (this process is implicit).


Rendering Scheduling Algorithm
------------------------------

### Overview

**OUTDATED**

This algorithm categorizes each rendering command into three types:

 * Stencil: Draws a stecil mask for a shape. Clipped by the active clipping
   layers.
 * Draw: Fill a rectangle masked by the stencil mask or a stroke
   using a paint object. This also clears the stencil mask.
 * Draw Stroke: Draws a stroke. Clipped by the active clipping layers.
 * Stencil Clip: Draws a stecil mask for a clipping shape. Clipped by the
   active clipping layers.
 * Clip: Adds a rectangle masked by the stecil mask to the working clipping
   layer. This also clears the stencil mask.
 * Clip Stroke: Draws a stroke to the working clipping layer.
   This also clears the stencil mask.
 * Unclip: Clears the rectangle area of the topmost active clipping layer(s).
 * Unstencil: 

Each DrawingContext API call is decomposed into some rendering commands:

 * `fill`: Stencil, Draw
 * `stroke`: Stencil, Draw Stroke, Unstencil
   * Stencil is required to prevent overdraw.
 * `applyClippingPath`: Turns the working clipping layer into an active
   clipping layer.
 * `popState`: Unclip
 * `fillClippingPath`: Stencil Clip, Clip
 * `strokeClippingPath`: Stencil Clip, Clip Stroke
   * Clip Stroke alone doesn't suffice because of a technial restriction.
     Clipping layers are implemented using a depth buffer and one cannot
     use two distnct depth values for depth test and depth writing.

Each command type requires GL context to be in certain states. The number
of state changes must be minimized by reordering the commands. Certain
paint types, for example texture paints, require even more state changes.

 * Draw command requires state changes to change the active texture.
 * Draw/Clip commands require state changes to change the current fill rule
   (odd-even and non-zero)

commands must be ordered correctly to produce the desired result.
To decide the correct order, we identify the following dependencies:

 * Stencil-and-draw dependency: Stencil commands must precede the
   corresponding draw command.
 * Overlapped rendering dependency: If a draw command's affected bounding
   box intersects another one, then their rendering order mustn't be changed.
 * Clipped rendering dependencies
    1. If we want a stencil to be clipped by a clipping path, then we must
       render the stencil after the construction of clipping layers (thus
       related Clip commands).
    2. And not after the destruction of the layers (thus related Unclip
       commands)
 * Clipping hierarchy dependencies
    1. Clipping layer must be constructed after the construction of the
       parent clipping layer.
    2. And vice versa.
 * Overlapped clip dependency: If bounding boxes of two sibling clipping
   layers overlap, then the construction of one layer must precede the
   destruction of another one.

EDIT: above dependencies are too strict, so we don't use them.

### Pseudocode

```python

# these both classes are named "Shape" in the TS code.
class Path:
  """
  PathData (named "Path" in the TS code) * (FillRule | StrokeStyle)
  """
  pass
class Shape:
  """
  Paint * Path

  Attributes:
  draw_path
  stencil_path
  unstencil_path
  """
  pass

def compact_layers(items):
  grouped = []
  for item, bounds in items:
    good_index = 0
    for i, group in numerate(grouped):
      for other_item, other_bounds in group:
        if bounds.intersects(other_bounds):
          good_index = i + 1
    if good_index >= len(grouped):
      grouped.append([])
    grouped[good_index].append((item, bounds))
  return [[item for item, bounds in items] for items in grouped]

def compact_layers_joinable(items):
  grouped = []
  for item, bounds, joinable in items:
    good_index = 0
    for i, group in numerate(grouped):
      hit = False; found_unjoinable = False
      for other_item, other_bounds,  other_joinable in group:
        if bounds.intersects(other_bounds):
          hit = True
          if not joinable and not other_joinable:
            found_unjoinable = True
      if hit:
        if found_unjoinable:
          good_index = i + 1
        else:
          good_index = i
    if good_index >= len(grouped):
      grouped.append([])
    grouped[good_index].append((item, bounds))
  return [[item for item, bounds in items] for items in grouped]

def compact_layers_unordered(items):
  # TODO

def clip(backend, shapes, layer):
  # for clipping, order doesn't matter
  groups = compact_layers_unordered([(s, s.get_visual_bounds()) 
    for s in paths])
  for group in groups:
    group = sort(group, key=(lambda s:s.fill_rule))
    for shape in group:
      scissor = shape.get_visual_bounds()
      backend.stencil(shape.stencil_path, layer - 1, scissor)
    for shape in group:
      backend.clip(layer, shape.draw_path, shape.get_visual_bounds())
    for shape in sort(group, key=(lambda s:s[0].fill_rule)):
      scissor = shape.get_visual_bounds()
      if shape.unstencil_path:
        backend.unstencil(shape.unstencil_path, layer - 1, scissor)

def draw(backend, shapes):
  groups = compact_layers([(shape, shape.get_visual_bounds()) 
    for shape in shapes])
  for group in groups:
    for shape in sort(group, key=(lambda s:s[0].fill_rule)):
      scissor = shape.get_visual_bounds()
      backend.stencil(shape.stencil_path, shape.layer, scissor)
    for shape in sort(group, key=(lambda s:s[0].paint.texture)):
      backend.draw(shape.paint, shape.draw_path, shape.get_visual_bounds())
    for shape in sort(group, key=(lambda s:s[0].fill_rule)):
      scissor = shape.get_visual_bounds()
      if shape.unstencil_path:
        backend.unstencil(shape.unstencil_path, shape.layer, scissor)

def render(backend, root_clip_node):
  layers = [WorkingClippingLayer() 
    for i in range(0, root.clipping_tree_height())]
  def render_layer(nodes, layer):

    # get_visual_bounds is the boundary box of the contents,
    # clipped by the clipping path's boundary box.
    subitems = []
    no_clips = True
    for node in nodes:
      if isinstance(node, ClipNode):
        for child in node.children:
          if isinstance(child, ClipNode):
            subitems.append((child, child.get_visual_bounds(), False))
            no_clips = False
          elif isinstance(child, Shape):
            child.layer = layer
            subitems.append((child, child.get_visual_bounds(), True))
      elif isinstance(node, Shape):
        subitems.append((node, node.get_visual_bounds(), True))

    if no_clips:
      # reached leaf
      draw(backend, [shape for shape, bounds, joinable in subitems])
      return

    sublayer_groups = compact_layers_joinable(subitems)

    for sublayer_group in sublayer_groups:
      clip_shapes = [shape
        for shape in node.clip_shapes
        for node in sublayer_group if isinstance(node, ClipNode)]
      clip(backend, clip_shapes, clip_unstencil_paths)

      render_layer(sublayer_group, layer + 1)

      is_last = sublayer_group == sublayer_groups[-1]
      if not is_last:
        for clip_path in clip_shapes:
          backend.unclip(clip_path.get_visual_bounds())


  render_layer([root_clip_node], 0)
```

### Usage of Stencil Buffer

The stencil buffer is used to perform a fill according to the fill rules
(odd-even or non-zero). Let `N` be the bit depth of the stencil buffer.
The value `1 << (N - 1)` is considered as the zero value. Filling an area
with the path that has CW winding order increases the value, and vice versa.

For adaptive supersampling, the special value `0` is used to indicate that
no rendering should be done on the pixel.

### Usage of Depth Buffer

The depth buffer is used to implement the active clipping layers.


Data Structures
---------------

- Command List Texture (a.k.a. Shader Data) is generated every
  frame and stored to OpenGL texture.
  - Command Descriptor
  - Gradient Descriptor
  - Command Mapping Descriptor
- Vertex Buffer Texture is only changed when new path geometries was
  loaded to the graphics system.
  - Draw Vertex
  - Quadratic Bezier Descriptor
- OpenGL Vertex Buffer only stores...
  - Integer Sequence

### Command Mapping Descriptor

Shader traverses this data structure to decide which command descriptor should
be used for the current vertex index. This data structure resembles a B+ tree.

- `float[3]` Vertex indices (relative to parent)
  - If the value is negative, then the value is `-1 - cmd_desc_ptr` where
    `cmd_desc_ptr` is the pointer to a Command Descriptor.
- `float[4]` Pointers to children

|       |  `.x` |  `.y` |  `.z` | `.w` |
|-------|-------|-------|-------|------|
| `[0]` | `vi0` | `vi1` | `vi2` |      |
| `[1]` | `c0`  | `c1`  | `c2`  | `c3` |

### Command Descriptor

* `float[6]` World matrix (`wm00` - `wm12`)
* `float[4]` Scissor matrix (global coord, `sm00`, `sm11`, `sm02`, `sm12`)
  * `(x, y) = ScissorMatrix * GlobalPos` and the `0 <= x, y < 1` area is drawn
* `float` Base vertex index (`vidx`)
* `int8` Clipping layer number (`layer`)
* `int8` Paint type (`pT`)
* `int8` Paint coordinate type (`pc`)
  * `Local`
  * `Global`
  * `Stroke`
* `float[6]` Paint matrix (`pm00` - `pm12`)
* `float[4]` Paint parameters (`pp0` - `pp3`)

|       |  `.x`  |  `.y`  |  `.z`  |   `.w`  |
|-------|--------|--------|--------|---------|
| `[0]` | `wm00` | `wm10` | `wm01` | `wm11`  |
| `[1]` | `wm02` | `wm12` | `vidx` | `layer` |
| `[2]` | `sm00` | `sm11` | `sm02` | `sm12`  |
| `[3]` | `pm00` | `pm10` | `pm01` | `pm11`  |
| `[4]` | `pm02` | `pm12` | `pT`   | `pc`    |
| `[5]` | `pp0`  | `pp1`  | `pp2`  | `pp3`   |

### State Table

|   Command    |    Shape    |   Paint    |  Shader |       Stencil        |   Depth    |
| ------------ | ----------- | ---------- | ------- | -------------------- | ---------- |
| Stencil      | Fill/Stroke | No         | Stencil | Update               | Test       |
| Draw         | Rectangle   | Yes        | Draw    | Test (EO/NZ) & Erase |            |
| Draw Stroke  | Stroke      | Y w/Stroke | Draw    | Test (NZ) & Erase    |            |
| Stencil Clip | Fill/Stroke | No         | Stencil | Update               | Test       |
| Clip         | Rectangle   | No         | Stencil | Test (EO/NZ) & Erase | Write      |
| Clip Stroke  | Stroke      | No         | Stencil | Test (NZ) & Erase    | Write      |
| Unclip       | Rectangle   | No         | Stencil |                      | Test/Write |

### Draw Vertex

* `float[2]` Local 2D coordinate
* `float` Primitive type
  * `Simple` - Entire the polygon is drawn (stroke/fill)
  * `QuadraticFill` - Discard polygon of the quadratic bezier segment (fill only)
  * `Circle` - `length(uv) < 1` (stroke only)
  * `QuadraticStroke` - Stroke of the quadratic bezier segment (stroke only)
* `float[4]` Its meaning depends on the primitive type
  * For `Simple`, stroke UV `float[2]`
  * For `QuadraticFill`, quadratic bezier UV `float[2]`
  * For `Circle`, circle UV `float[2]`, stroke U `float`, stroke V side `float`
    * Stroke V coord is generated by `length(uv) * stroke_v_side + 0.5`
    * If `stroke_v_side > 1`, however, then the `uv.y * .5 + .5` is used as the stroke V.
  * For `QuadraticStroke`, depressed cubic eq coefs `float[2]`, `2 / stroke_width` `float`,
    *Quadratic bezier descriptor pointer* `float`

|       |  `.x` |  `.y` |  `.z`  |  `.w` |
|-------|-------|-------|--------|-------|
| `[0]` | `x`   | `y`   | `type` |       |
| `[1]` | `sp0` | `sp1` | `sp2`  | `sp3` |

### Quadratic Bezier Descriptor

* `float[2]` Origin
* `float[4]` Control points relative to origin, multiplied by `2 / stroke_width` (2x2)
* `float[2]` stroke U range
* `float` cubic equation depression offset `doffs = b / 3a`

|       |   `.x`  | `.y` |  `.z`  |   `.w`   |
|-------|---------|------|--------|----------|
| `[0]` | `x1`    | `y1` | `x2`   | `y2`     |
| `[1]` | `x3`    | `y3` | `umin` | `urange` |
| `[2]` | `doffs` |      |        |          |


References
----------

* Mark J. Kligard, Jeff Bolz, NVIDIA Corporation, "*GPU-accelerated Path Rendering*."
