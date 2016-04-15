"use strict";

const xml2js = require("xml2js");
const Hyper2D = require("../../dist/hyper2d");
const nullgl = require("../lib/nullgl");

function parseSVGPath(str, cb)
{
    let i = 0;
    const re = /[ ,]*([A-Za-z]|[-+]?(?:[0-9]*(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?)/g;
    let match;
    let cmd = [];

    while (match = re.exec(str)) {
        if (match[1].length === 0) {
            break;
        }
        const cc = match[1].charCodeAt(0);
        if (cc >= 0x40) {
            if (cmd.length) {
                cb(cmd);
                cmd.length = 0;
            }

            // cmd
            cmd.push(match[1]);
        } else {
            const num = parseFloat(match[1]);
            if (!isFinite(num)) {
                throw new Error(`failed to parse: ${match[1]}`);
            }
            cmd.push(num);
        }
    }

    if (cmd.length) {
        cb(cmd);
        cmd.length = 0;
    }
}

class Hyper2DSVGImage
{

    constructor(svg)
    {
        this.objs = [];
        const self = this;

        this.processNode(svg.svg);
    }

    processNode(node)
    {
        for (let key in node) {
            if (key === "$") {
                continue;
            }
            const children = node[key];
            if (key === "path") {
                for (const path of children) {
                    this.processPath(path);
                }
            } else {
                for (const child of children) {
                    this.processNode(child);
                }
            }
        }
    }

    processPath(path)
    {
        const d = path.$.d;
        const pb = new Hyper2D.PathBuilder();

        let curX = 0, curY = 0;
        let lastCX = 0, lastCY = 0;
        parseSVGPath(d, (cmd) => {
            let nextLastCX = NaN, nextLastCY = NaN;
            switch (cmd[0]) {
                case "M":
                    for (let i = 1; i < cmd.length; i += 2) {
                        curX = cmd[i]; curY = cmd[i + 1];
                        pb.moveTo(curX, curY);
                    }
                    break;
                case "m":
                    for (let i = 1; i < cmd.length; i += 2) {
                        curX += cmd[i]; curY += cmd[i + 1];
                        pb.moveTo(curX, curY);
                    }
                    break;
                case "Z": case "z":
                    pb.closePath();
                    break;
                case "L":
                    for (let i = 1; i < cmd.length; i += 2) {
                        curX = cmd[i]; curY = cmd[i + 1];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "l":
                    for (let i = 1; i < cmd.length; i += 2) {
                        curX += cmd[i]; curY += cmd[i + 1];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "H":
                    for (let i = 1; i < cmd.length; ++i) {
                        curX = cmd[i];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "h":
                    for (let i = 1; i < cmd.length; ++i) {
                        curX += cmd[i];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "V":
                    for (let i = 1; i < cmd.length; ++i) {
                        curY = cmd[i];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "v":
                    for (let i = 1; i < cmd.length; ++i) {
                        curY += cmd[i];
                        pb.lineTo(curX, curY);
                    }
                    break;
                case "C":
                    for (let i = 1; i < cmd.length; i += 6) {
                        pb.bezierCurveTo(
                            cmd[i],     cmd[i + 1],
                            cmd[i + 2], cmd[i + 3],
                            cmd[i + 4], cmd[i + 5]);
                        nextLastCX = cmd[i + 2]; nextLastCY = cmd[i + 3];
                        curX = cmd[i + 4]; curY = cmd[i + 5];
                    }
                    break;
                case "c":
                    for (let i = 1; i < cmd.length; i += 6) {
                        pb.bezierCurveTo(
                            curX + cmd[i],     curY + cmd[i + 1],
                            curX + cmd[i + 2], curY + cmd[i + 3],
                            curX + cmd[i + 4], curY + cmd[i + 5]);
                        nextLastCX = curX + cmd[i + 2]; nextLastCY = curY + cmd[i + 3];
                        curX += cmd[i + 4]; curY += cmd[i + 5];
                    }
                    break;
                case "S":
                    for (let i = 1; i < cmd.length; i += 4) {
                        pb.bezierCurveTo(
                            curX * 2 - lastCX, curY * 2 - lastCY,
                            cmd[i],     cmd[i + 1],
                            cmd[i + 2], cmd[i + 3]);
                        nextLastCX = cmd[i]; nextLastCY = cmd[i + 1];
                        curX = cmd[i + 2]; curY = cmd[i + 3];
                    }
                    break;
                case "s":
                    for (let i = 1; i < cmd.length; i += 4) {
                        pb.bezierCurveTo(
                            curX * 2 - lastCX, curY * 2 - lastCY,
                            curX + cmd[i],     curY + cmd[i + 1],
                            curX + cmd[i + 2], curY + cmd[i + 3]);
                        nextLastCX = curX + cmd[i]; nextLastCY = curY + cmd[i + 1];
                        curX += cmd[i + 2]; curY += cmd[i + 3];
                    }
                    break;
                case "Q":
                    for (let i = 1; i < cmd.length; i += 4) {
                        pb.quadraticCurveTo(
                            cmd[i],     cmd[i + 1],
                            cmd[i + 2], cmd[i + 3]);
                        nextLastCX = cmd[i]; nextLastCY = cmd[i + 1];
                        curX = cmd[i + 2]; curY = cmd[i + 3];
                    }
                    break;
                case "q":
                    for (let i = 1; i < cmd.length; i += 4) {
                        pb.quadraticCurveTo(
                            curX + cmd[i],     curY + cmd[i + 1],
                            curX + cmd[i + 2], curY + cmd[i + 3]);
                        nextLastCX = curX + cmd[i]; nextLastCY = curY + cmd[i + 1];
                        curX += cmd[i + 2]; curY += cmd[i + 3];
                    }
                    break;
                case "T":
                    for (let i = 1; i < cmd.length; i += 2) {
                        pb.quadraticCurveTo(
                            curX * 2 - lastCX, curY * 2 - lastCY,
                            cmd[i],     cmd[i + 1]);
                        nextLastCX = curX * 2 - lastCX; nextLastCY = curY * 2 - lastCY;
                        curX = cmd[i]; curY = cmd[i + 1];
                    }
                    break;
                case "t":
                    for (let i = 1; i < cmd.length; i += 2) {
                        pb.quadraticCurveTo(
                            curX * 2 - lastCX, curY * 2 - lastCY,
                            curX + cmd[i],     curY + cmd[i + 1]);
                        nextLastCX = curX * 2 - lastCX; nextLastCY = curY * 2 - lastCY;
                        curX += cmd[i]; curY += cmd[i + 1];
                    }
                    break;
                case "A": case "a":
                    for (let i = 1; i < cmd.length; i += 7) {
                        let rx = cmd[i], ry = cmd[i + 1];
                        const rot = cmd[i + 2], largeArc = !!cmd[i + 3];
                        const sweep = !!cmd[i + 4];
                        let x = cmd[i + 5], y = cmd[i + 6];
                        if (cmd[0] === "a") {
                            x += curX; y += curY;
                        }

                        if (x === curX || y === curY) {
                            continue;
                        }

                        if (rx === 0 && ry === 0) {
                            pb.lineTo(x, y);
                            curX = x; curY = y;
                            continue;
                        }
                        rx = Math.abs(rx); ry = Math.abs(ry);

                        const rCos = Math.cos(rot), rSin = Math.sin(rot);
                        const mx = (x - curX) * 0.5, my = (y - curY) * 0.5;
                        const xd = rCos * mx + rSin * my;
                        const yd = -rSin * mx + rCos * my;
                        const sk = xd * xd / (rx * rx) + yd * yd / (ry * ry);
                        if (sk > 1) {
                            rx *= sk; ry *= sk;
                        }
                        const csq = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yd * yd - ry * ry * xd * xd) /
                            (rx * rx * yd * yd + ry * ry * xd * xd))) *
                            (largeArc == sweep ? -1 : 1);
                        const cxd = csq * (rx * yd / ry);
                        const cyd = csq * -(ry * xd / rx);
                        const cx = rCos * cxd - rSin * cyd + (x + curX) * 0.5;
                        const cy = rSin * cxd + rCos * cyd + (y + curY) * 0.5;
                        const theta1 = Math.atan2((yd - cyd) / ry, (xd - cxd) / rx);
                        let thetaD = Math.atan2((-yd - cyd) / ry, (-xd - cxd) / rx)
                            - Math.atan2((yd - cyd) / ry, (xd - cxd) / rx);
                        thetaD -= Math.floor(thetaD / (Math.PI * 2)) * (Math.PI * 2);
                        if (!sweep) {
                            thetaD -= Math.PI * 2;
                        } else if (thetaD === 0) {
                            thetaD = Math.PI * 2;
                        }

                        pb.ellipse(cx, cy, rx, ry, rot,
                            theta1, theta1 + thetaD, thetaD < 0);

                        curX = x; curY = y;
                    }
                    break;
            }
            if (isFinite(nextLastCX)) {
                lastCX = nextLastCX; lastCY = nextLastCY;
            } else {
                lastCX = curX; lastCY = curY;
            }
        });

        const re = /([-a-zA-Z]+) *: *([^;]+)/g;
        let style = path.$.style || "";
        let match;
        let paint = new Hyper2D.SolidPaint(new Hyper2D.Color(0,0,0,1));
        let fillRule = Hyper2D.FillRule.NonZero;
        while (match = re.exec(style)) {
            if (match[1] === "fill") {
                const color = match[2];
                if (color.substr(0, 1) === "#") {
                    const hex = parseInt(color.substr(1, 6), 16);
                    let hcolor;
                    if (color.length < 7) {
                        hcolor = new Hyper2D.Color(
                            (hex >> 8) * 0x11 / 255,
                            ((hex >> 4) & 0xf) * 0x11 / 255,
                            ((hex >> 0) & 0xf) * 0x11 / 255,
                            1
                        );
                    } else {
                        hcolor = new Hyper2D.Color(
                            (hex >> 16) / 255,
                            ((hex >> 8) & 0xff) / 255,
                            ((hex >> 0) & 0xff) / 255,
                            1
                        );
                    }
                    paint = new Hyper2D.SolidPaint(hcolor);
                } else if (color === "none") {
                    paint = null;
                }
                } else if (match[1] === "fill-rule") {
                switch (match[2]) {
                    case "evenodd": fillRule = Hyper2D.FillRule.EvenOdd; break;
                    case "nonzero": fillRule = Hyper2D.FillRule.NonZero; break;
                }
            }
            // TODO: stroke
            }

            if (!paint) {
                return;
            }

        const hpath = pb.createPath(Hyper2D.PathUsage.Static);
        const matrix = new Hyper2D.Matrix3().setIdentity();

        this.objs.push({
            path: hpath, paint, fillRule, matrix
        });
    }

    render(context, matrix)
    {
        const objs = this.objs;
        const m = new Hyper2D.Matrix3();

        for (let obj of objs) {
            context.setTransform(m.copyFrom(matrix).multiply(obj.matrix));
            context.fill(obj.paint, obj.fillRule, obj.path);
        }
    }
}

console.log("Loading tiger.svg...");

const tigerSVG = require("fs").readFileSync("../../examples/img/tiger.svg", {
    "encoding": "utf-8"
});
let svgImage;

xml2js.parseString(tigerSVG, (err, result) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log("SVG image loaded.");

    svgImage = new Hyper2DSVGImage(result);

    startTest();
});

function startTest()
{
    const gl = new nullgl.WebGLRenderingContext();
    const ctx = Hyper2D.createContext(gl, {
        fastSetup: true
    });
    const canvas = ctx.createCanvas(512, 512);

    function renderFrame()
    {
        const m = new Hyper2D.Matrix3();
        m.setIdentity();
        svgImage.render(canvas, m);

        ctx.setup();
        canvas.resolve();
        ctx.unsetup();
    }
    renderFrame();
    renderFrame();

    if (process.argv[2] === "loop") {
        for (let i = 0; i < 100000; ++i) {
            renderFrame();
        }
    } else {

        const Benchmark = require('benchmark');
        const benchmarks = require('beautify-benchmark');
        const suite = new Benchmark.Suite;
        suite.add('draw', () => {
            renderFrame();
        })
        .on('cycle', (e) => {
            benchmarks.add(e.target);
        })
        .on('complete', () => {
            benchmarks.log()
        })
        .run({ async: true });

    }
}

