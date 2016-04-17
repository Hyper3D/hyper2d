
import { ContextImpl } from "./context";
import { Backend } from "./backend";
import { Color } from "../utils/color";
import { ObjectPool } from "../utils/pool";
import { Vector2 } from "../utils/geometry";
import { computeBoundingBoxForTransformedAABB } from "../utils/advgeometry";
import { countTrailingZeroBits } from "../utils/math";

import { Path, PathBuilder, PathUsage } from "../frontend/path";
import { BasePaint } from "../frontend/paint";
import { Matrix3 } from "../utils/geometry";
import { StrokeStyle } from "../frontend/stroke";
import { Sprite } from "../frontend/sprite";
import { FillRule } from "../frontend/drawingcontext";

import { CompiledPaint } from "./paint";
import { ResidentPath, ResidentPathset } from "./vtxmgr";

import { OverlapDetector, OverlapDetectorMode } from "../utils/overlapdetector";

const enum NodeType
{
    Shape,
    ClippingNode,
    ShapeGroup
}

class Node
{
    visualBoundsMin: Vector2;
    visualBoundsMax: Vector2;

    constructor(public type: NodeType)
    {
        this.visualBoundsMin = new Vector2();
        this.visualBoundsMax = new Vector2();
    }

    prepare(): void
    {
        throw new Error("pure virtual function call");
    }
}

export class ClippingNode extends Node
{
    clippingPath: Shape[];
    children: (ClippingNode | Shape)[];

    // computed by prepare()
    // visualBoundsMin: Vector2;
    // visualBoundsMax: Vector2;

    constructor()
    {
        super(NodeType.ClippingNode);
        this.clippingPath = [];
        this.children = [];
    }

    reset(): void
    {
        this.clippingPath.length = 0;
        this.children.length = 0;
    }

    prepare(): void
    {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const child of this.children) {
            child.prepare();
            const {visualBoundsMin, visualBoundsMax} = child;
            minX = Math.min(minX, visualBoundsMin.x);
            minY = Math.min(minY, visualBoundsMin.y);
            maxX = Math.max(maxX, visualBoundsMax.x);
            maxY = Math.max(maxY, visualBoundsMax.y);
        }
        this.visualBoundsMin.set(minX, minY);
        this.visualBoundsMax.set(maxX, maxY);

        // Clip the visualBounds of clippingPath
        for (const cp of this.clippingPath) {
            const {visualBoundsMin: vbMin, visualBoundsMax: vbMax} = cp;
            vbMin.x = Math.max(vbMin.x, minX);
            vbMin.y = Math.max(vbMin.y, minY);
            vbMax.x = Math.min(vbMax.x, maxX);
            vbMax.y = Math.min(vbMax.y, maxY);
        }
    }
}

export class Shape extends Node
{
    stencilPath: ResidentPath;
    drawPath: ResidentPath;
    unstencilPath: ResidentPath;
    paint: CompiledPaint;
    fillRule: FillRule;
    matrix: Matrix3;

    /** Assigned by CommandScheduler */
    renderingLayerId: number;

    // computed by the creator of Shape
    // visualBoundsMin: Vector2;
    // visualBoundsMax: Vector2;

    constructor()
    {
        super(NodeType.Shape);
        this.stencilPath = null;
        this.drawPath = null;
        this.unstencilPath = null;
        this.fillRule = FillRule.EvenOdd;
        this.paint = null;
        this.matrix = new Matrix3();
        this.renderingLayerId = 0;
    }

    reset(): void
    {
        this.stencilPath = null;
        this.unstencilPath = null;
        this.drawPath = null;
        this.paint = null;
    }

    prepare(): void
    {
        // already computed by the creator
    }
}

/** <code>ShapeGroup</code>s are created by <code>CommandScheduler</code> to
 * group some neighboring <code>Shape</code>s to make the process faster.
 */
class ShapeGroup extends Node
{
    children: Shape[];

    constructor()
    {
        super(NodeType.ShapeGroup);
        this.children = [];
    }

    reset(): void
    {
        this.children.length = 0;
    }

    prepare(): void
    {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const child of this.children) {
            const {visualBoundsMin, visualBoundsMax} = child;
            minX = Math.min(minX, visualBoundsMin.x);
            minY = Math.min(minY, visualBoundsMin.y);
            maxX = Math.max(maxX, visualBoundsMax.x);
            maxY = Math.max(maxY, visualBoundsMax.y);
        }
        this.visualBoundsMin.set(minX, minY);
        this.visualBoundsMax.set(maxX, maxY);
    }
}


export const clippingNodePool = new ObjectPool<ClippingNode>(() => new ClippingNode());
export const shapePool = new ObjectPool<Shape>(() => new Shape());
const shapeGroupPool = new ObjectPool<ShapeGroup>(() => new ShapeGroup());

class RenderingLayer
{
    activeNodes: (ClippingNode | ShapeGroup)[];
    layerCompressor: LayerCompressor<Shape | ClippingNode | ShapeGroup>;
    allNodes: (Shape | ClippingNode | ShapeGroup)[];

    constructor(width: number, height: number)
    {
        this.activeNodes = [];
        this.allNodes = [];
        this.layerCompressor = new LayerCompressor<Shape | ClippingNode | ShapeGroup>(
            width, height, true);
    }
}

const rectanglePath = (() => {
    const builder = new PathBuilder();
    builder.moveTo(0, 0); builder.lineTo(1, 0);
    builder.lineTo(1, 1); builder.lineTo(0, 1);
    return builder.createPath(PathUsage.Static);
})();
const rectanglePathMatrix = new Matrix3().setIdentity();

const temporaryShapesList: Shape[] = [];

export class CommandScheduler
{
    renderingLayers: RenderingLayer[];
    allocatedShapeGroups: ShapeGroup[];
    shapeLayerCompressor: LayerCompressor<Shape>;
    unorderedShapeLayerCompressor: UnorderedLayerCompressor<Shape>;

    rectanglePathCompiled: ResidentPathset;

    constructor(private ctx: ContextImpl,
        private backend: Backend,
        private width: number,
        private height: number)
    {
        this.renderingLayers = [];
        this.allocatedShapeGroups = [];
        this.shapeLayerCompressor =
            new LayerCompressor<Shape>(width, height, false);
        this.unorderedShapeLayerCompressor =
            new UnorderedLayerCompressor<Shape>(width, height);
        this.rectanglePathCompiled = ctx.vertexBufferManager.getResidentPath(rectanglePath, null);
    }

    render(root: ClippingNode): void
    {
        const {ctx, backend, renderingLayers} = this;
        const {gl} = ctx;
        root.prepare();

        if (root == null) {
            backend.complete();
            return;
        }

        if (renderingLayers.length == 0) {
            renderingLayers.push(new RenderingLayer(this.width, this.height));
        }
        const bottomRenderingLayer = renderingLayers[0];
        bottomRenderingLayer.activeNodes.length = 1;
        bottomRenderingLayer.activeNodes[0] = root;

        this.renderLayer(0);

        backend.complete();

        // release allocated objects
        for (const sg of this.allocatedShapeGroups) {
            sg.reset();
            shapeGroupPool.release(sg);
        }
        this.allocatedShapeGroups.length = 0;
    }

    private renderLayer(renderingLayerId: number): void
    {
        const {renderingLayers} = this;

        const renderingLayer = renderingLayers[renderingLayerId];

        if (renderingLayers.length <= renderingLayerId + 1) {
            renderingLayers.push(new RenderingLayer(this.width, this.height));
        }
        const nextRenderingLayer = renderingLayers[renderingLayerId + 1];

        const activeNodes = renderingLayer.activeNodes;
        const {allNodes: nextAllNodes, activeNodes: nextActiveNodes} = nextRenderingLayer;
        nextAllNodes.length = 0;
        let hasNoClips = true;

        for (const activeNode of activeNodes) {
            switch (activeNode.type) {
                case NodeType.ClippingNode:
                    for (const child of (<ClippingNode> activeNode).children) {
                        switch (child.type) {
                            case NodeType.ClippingNode:
                                hasNoClips = false;
                                break;
                            case NodeType.Shape:
                                (<Shape> child).renderingLayerId = renderingLayerId;
                                break;
                            default:
                                throw new Error("bad NodeType");
                        }
                        nextAllNodes.push(child);
                    }
                    break;
                case NodeType.ShapeGroup:
                    nextAllNodes.push(activeNode);
                    break;
                default:
                    throw new Error("bad NodeType");
            }
        }

        if (hasNoClips) {
            // Leaf
            this.draw(nextRenderingLayer);
            nextAllNodes.length = 0;
            return;
        }

        const {layerCompressor: lc} = renderingLayer;
        for (const nextNode of nextAllNodes) {
            lc.processOne(nextNode);
        }

        const {output: groups, numGroups} = lc;
        for (let i = 0; i < numGroups; ++i) {
            const group = groups[i];

            // Clip
            const clipShapes = temporaryShapesList;
            clipShapes.length = 0;
            for (const e of group) {
                if (e.type === NodeType.ClippingNode) {
                    for (const s of (<ClippingNode>e).clippingPath) {
                        clipShapes.push(s);
                    }
                }
            }
            this.clip(clipShapes, renderingLayerId + 1);
            clipShapes.length = 0;

            // Children
            nextActiveNodes.length = 0;
            let shapeGroup: ShapeGroup = null;
            for (const e of group) {
                switch (e.type) {
                    case NodeType.ClippingNode:
                    case NodeType.ShapeGroup:
                        if (shapeGroup != null) {
                            shapeGroup.prepare();
                            nextActiveNodes.push(shapeGroup);
                            shapeGroup = null;
                        }
                        nextActiveNodes.push(<ClippingNode | ShapeGroup> e);
                        break;
                    case NodeType.Shape:
                        // Shapes must be grouped into ShapeGroups
                        if (shapeGroup == null) {
                            this.allocatedShapeGroups.push(shapeGroup = shapeGroupPool.get());
                        }
                        shapeGroup.children.push(<Shape> e);
                        break;
                }
            }
            if (shapeGroup != null) {
                shapeGroup.prepare();
                nextActiveNodes.push(shapeGroup);
                shapeGroup = null;
            }
            this.renderLayer(renderingLayerId + 1);

            // Unclip
            if (i == numGroups - 1) {
                continue; // no need to unclip
            }
            for (const e of group) {
                if (e.type === NodeType.ClippingNode) {
                    this.unclip(e.visualBoundsMin, e.visualBoundsMax,
                        renderingLayerId);
                }
            }
        }

        lc.reset();
    }

    private draw(renderingLayer: RenderingLayer): void
    {
        const {backend, shapeLayerCompressor: lc} = this;
        const {commandParameter: cp} = backend;

        lc.reset();

        for (const node of renderingLayer.allNodes) {
            switch (node.type) {
                case NodeType.Shape:
                    lc.processOne(<Shape> node);
                    break;
                case NodeType.ShapeGroup:
                    for (const shape of (<ShapeGroup> node).children) {
                        lc.processOne(shape);
                    }
                    break;
                default:
                    throw new Error("bad NodeType");
            }
        }

        cp.paint = null;

        const {output: groups, numGroups} = lc;

        for (let i = 0; i < numGroups; ++i) {
            const group = groups[i];

            // TODO: sort by FillRule
            for (const shape of group) {
                cp.worldMatrix = shape.matrix;
                cp.clippingLayer = shape.renderingLayerId;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                backend.stencil(shape.stencilPath,
                    shape.fillRule);
            }

            // TODO: sort by texture
            for (const shape of group) {
                cp.worldMatrix = shape.matrix;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                cp.paint = shape.paint;
                backend.draw(shape.drawPath);
            }

            for (const shape of group) {
                if (!shape.unstencilPath) {
                    continue;
                }
                cp.worldMatrix = shape.matrix;
                cp.clippingLayer = shape.renderingLayerId;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                backend.unstencil(shape.unstencilPath);
            }
        }

        lc.reset();
    }

    private clip(shapes: Shape[], layerId: number): void
    {
        const {backend, shapeLayerCompressor: lc} = this;
        const {commandParameter: cp} = backend;

        for (const shape of shapes) {
             lc.processOne(shape);
        }

        cp.paint = null;
        cp.clippingLayer = layerId;

        const {output: groups, numGroups} = lc;

        for (let i = 0; i < numGroups; ++i) {
            const group = groups[i];

            // TODO: sort by FillRule
            for (const shape of group) {
                cp.worldMatrix = shape.matrix;
                cp.clippingLayer = shape.renderingLayerId;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                backend.stencil(shape.stencilPath,
                    shape.fillRule);
            }

            for (const shape of group) {
                cp.worldMatrix = shape.matrix;
                cp.clippingLayer = shape.renderingLayerId;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                backend.clip(shape.drawPath);
            }

            for (const shape of group) {
                if (!shape.unstencilPath) {
                    continue;
                }
                cp.worldMatrix = shape.matrix;
                cp.clippingLayer = shape.renderingLayerId;
                cp.scissorMin = shape.visualBoundsMin;
                cp.scissorMax = shape.visualBoundsMax;
                backend.unstencil(shape.unstencilPath);
            }
        }

        lc.reset();
    }

    private unclip(scissorMin: Vector2, scissorMax: Vector2, layerId: number): void
    {
        const {backend} = this;
        const {commandParameter: cp} = backend;

        cp.paint = null;
        cp.scissorMin = scissorMin;
        cp.scissorMax = scissorMax;
        cp.clippingLayer = layerId;

        const {e} = cp.worldMatrix = rectanglePathMatrix;
        e[0] = scissorMax.x - scissorMin.x;
        e[4] = scissorMax.y - scissorMin.y;
        e[6] = scissorMin.x; e[7] = scissorMin.y;
        backend.unclip(this.rectanglePathCompiled.shapePath);
    }
}

class LayerCompressor<T extends Node>
{
    private od: OverlapDetector;
    private odJoinable: OverlapDetector;
    output: T[][];
    numGroups: number;

    // TODO: support the joinables
    constructor(width: number, height: number,
        supportJoinable: boolean)
    {
        const prec = Math.ceil(Math.max(1, Math.max(width, height) / 64));
        this.od = new OverlapDetector(width, height, prec,
            OverlapDetectorMode.HighestLayerIndex);
        this.odJoinable = supportJoinable ?
            new OverlapDetector(width, height, prec,
            OverlapDetectorMode.HighestLayerIndex) : null;
        this.output = [];
        this.numGroups = 0;
    }

    reset(): void
    {
        this.output.length = 0;
        this.numGroups = 0;
        this.od.clear();
        if (this.odJoinable) {
            this.odJoinable.clear();
        }
    }

    private getGroup(index: number): T[]
    {
        const {output} = this;
        if (index >= output.length) {
            output.push([]);
        }
        this.numGroups = Math.max(this.numGroups, index + 1);
        return output[index];
    }

    processOne(node: T): void
    {
        const {od, odJoinable} = this;

        const {visualBoundsMin: vbMin, visualBoundsMax: vbMax} = node;

        const joinable = node.type != NodeType.ClippingNode;
        let placedLayer: number;
        if (odJoinable && joinable) {
            const joinedLayer = odJoinable ?
                odJoinable.intersects(vbMin.x, vbMin.y,
                vbMax.x, vbMax.y) : null;
            placedLayer = joinedLayer != null ? joinedLayer : 0;
        } else {
            const underlyingLayer = od.intersects(vbMin.x, vbMin.y,
                vbMax.x, vbMax.y);
            const joinedLayer = odJoinable ?
                odJoinable.intersects(vbMin.x, vbMin.y,
                vbMax.x, vbMax.y) : null;
            placedLayer = underlyingLayer != null ? underlyingLayer + 1 : 0;
            if (joinedLayer != null && joinedLayer > placedLayer) {
                placedLayer = joinedLayer;
            }
        }

        od.insert(vbMin.x, vbMin.y,
            vbMax.x, vbMax.y, placedLayer);
        if (odJoinable && joinable) {
            odJoinable.insert(vbMin.x, vbMin.y,
                vbMax.x, vbMax.y, placedLayer);
        }

        this.getGroup(placedLayer).push(node);
    }
}

class UnorderedLayerCompressor<T extends Node>
{
    private ods: OverlapDetector[];
    output: T[][];
    numGroups: number;

    constructor(private width: number, private height: number)
    {
        this.ods = [this.createOverlapDetector()];
        this.output = [];
        this.numGroups = 0;
    }

    private createOverlapDetector(): OverlapDetector
    {
        const prec = Math.ceil(Math.max(1, Math.max(this.width, this.height) / 64));
        return new OverlapDetector(this.width, this.height, prec,
            OverlapDetectorMode.OccupiedLayerBitmap);
    }

    reset(): void
    {
        this.output.length = 0;
        this.numGroups = 0;
        for (const od of this.ods) {
            od.clear();
        }
    }

    private getGroup(index: number): T[]
    {
        const {output} = this;
        if (index >= output.length) {
            output.push([]);
        }
        this.numGroups = Math.max(this.numGroups, index + 1);
        return output[index];
    }

    processOne(node: T): void
    {
        const {ods} = this;

        const {visualBoundsMin: vbMin, visualBoundsMax: vbMax} = node;

        let placedLayer = -1;
        for (let i = 0; i < ods.length; ++i) {
            const od = ods[i];
            const freeLayers =
                ~od.intersects(vbMin.x, vbMin.y,
                vbMax.x, vbMax.y);
            if (freeLayers !== 0) {
                // found free layer
                placedLayer = (i << 5) + countTrailingZeroBits(freeLayers);
            }
        }

        if (placedLayer === -1) {
            placedLayer = ods.length << 5;
            ods.push(this.createOverlapDetector());
        }

        ods[placedLayer >> 5].insert(vbMin.x, vbMin.y,
            vbMax.x, vbMax.y, placedLayer);

        this.getGroup(placedLayer).push(node);
    }
}