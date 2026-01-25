declare module "p5" {
  export default class p5 {
    constructor(sketch: (p: p5) => void, node?: HTMLElement | string);

    // 生命周期
    setup?(): void;
    draw?(): void;
    windowResized?(): void;

    // 画布与像素
    createCanvas(width: number, height: number): any;
    resizeCanvas(width: number, height: number): void;
    pixelDensity(density: number): void;

    // 绘制基础图元
    background(r: number, g?: number, b?: number, a?: number): void;
    stroke(r: number, g?: number, b?: number, a?: number): void;
    strokeWeight(weight: number): void;
    line(x1: number, y1: number, x2: number, y2: number): void;
    noStroke(): void;
    fill(r: number, g?: number, b?: number, a?: number): void;

    // 文本
    text(str: string, x: number, y: number): void;
    textAlign(horiz: number, vert: number): void;
    textSize(size: number): void;

    // 常量
    readonly LEFT: number;
    readonly BOTTOM: number;

    // 清理
    remove(): void;
  }
}



