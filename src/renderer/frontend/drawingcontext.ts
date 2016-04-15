
import { Path } from "./path";
import { BasePaint } from "./paint";
import { Matrix3Like } from "../utils/geometry";
import { StrokeStyle } from "./stroke";
import { Sprite } from "./sprite";

export interface DrawingContext
{
    pushState(): void;
    popState(): void;

    setTransform(m: Matrix3Like): void;

    stroke(paint: BasePaint, style: StrokeStyle, path: Path): void;
    fill(paint: BasePaint, fillRule: FillRule, path: Path): void;
    drawSprite(sprite: Sprite): void;

    strokeClippingMask(style: StrokeStyle, path: Path): void;
    fillClippingMask(fillRule: FillRule, path: Path): void;
    drawSpriteClippingMask(sprite: Sprite): void;
    applyClippingMask(): void;
}

export enum FillRule
{
    NonZero = 1,
    EvenOdd
}
