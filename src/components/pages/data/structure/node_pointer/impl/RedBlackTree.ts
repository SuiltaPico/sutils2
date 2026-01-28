import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export enum RBTColor {
    RED = 'RED',
    BLACK = 'BLACK'
}

export class RedBlackTree implements IDataStructure {
    name = "红黑树 (RBT)";
    private backend!: IMemoryBackend;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    private getColor(node: any): RBTColor {
        if (!node) return RBTColor.BLACK;
        return this.backend.read(node, 'color') || RBTColor.RED;
    }

    private setColor(node: any, color: RBTColor): void {
        if (!node) return;
        this.backend.write(node, 'color', color);
    }

    private getParent(node: any): any {
        return node ? this.backend.read(node, 'parent') : null;
    }

    private setParent(node: any, parent: any): void {
        if (node) this.backend.write(node, 'parent', parent);
    }

    private *rotateLeft(x: any): Generator<StepAction, any> {
        const y = this.backend.read(x, 'right');
        yield { type: 'log', message: `对节点 ${this.backend.read(x, 'value')} 执行左旋` };

        const T2 = this.backend.read(y, 'left');
        this.backend.write(x, 'right', T2);
        if (T2) this.setParent(T2, x);

        const xParent = this.getParent(x);
        this.setParent(y, xParent);

        if (!xParent) {
            this.backend.setRoot(y);
            this.backend.setPointer('root', y);
        } else if (x === this.backend.read(xParent, 'left')) {
            this.backend.write(xParent, 'left', y);
        } else {
            this.backend.write(xParent, 'right', y);
        }

        this.backend.write(y, 'left', x);
        this.setParent(x, y);

        yield { type: 'write', target: y.id, message: `左旋完成` };
        return y;
    }

    private *rotateRight(y: any): Generator<StepAction, any> {
        const x = this.backend.read(y, 'left');
        yield { type: 'log', message: `对节点 ${this.backend.read(y, 'value')} 执行右旋` };

        const T2 = this.backend.read(x, 'right');
        this.backend.write(y, 'left', T2);
        if (T2) this.setParent(T2, y);

        const yParent = this.getParent(y);
        this.setParent(x, yParent);

        if (!yParent) {
            this.backend.setRoot(x);
            this.backend.setPointer('root', x);
        } else if (y === this.backend.read(yParent, 'left')) {
            this.backend.write(yParent, 'left', x);
        } else {
            this.backend.write(yParent, 'right', x);
        }

        this.backend.write(x, 'right', y);
        this.setParent(y, x);

        yield { type: 'write', target: x.id, message: `右旋完成` };
        return x;
    }

    *insert(value: any): Generator<StepAction> {
        let z = this.backend.malloc({ value, left: null, right: null, parent: null, color: RBTColor.RED });
        yield { type: 'alloc', target: z.id, message: `创建新节点 (RED): ${value}` };

        let y: any = null;
        let x = this.backend.getRoot();

        this.backend.setPointer('current', x);
        while (x) {
            y = x;
            const xVal = this.backend.read(x, 'value');
            yield { type: 'move_ptr', target: x.id, message: `比较 ${value} 与 ${xVal}` };
            if (value < xVal) {
                x = this.backend.read(x, 'left');
            } else {
                x = this.backend.read(x, 'right');
            }
            this.backend.setPointer('current', x);
        }

        this.setParent(z, y);
        if (!y) {
            this.backend.setRoot(z);
            this.backend.setPointer('root', z);
        } else {
            const yVal = this.backend.read(y, 'value');
            if (value < yVal) {
                this.backend.write(y, 'left', z);
            } else {
                this.backend.write(y, 'right', z);
            }
        }

        yield* this.insertFixup(z);
    }

    private *insertFixup(z: any): Generator<StepAction> {
        while (this.getColor(this.getParent(z)) === RBTColor.RED) {
            let parent = this.getParent(z);
            let grandParent = this.getParent(parent);

            if (parent === this.backend.read(grandParent, 'left')) {
                let uncle = this.backend.read(grandParent, 'right');
                if (this.getColor(uncle) === RBTColor.RED) {
                    // Case 1: Uncle is Red
                    yield { type: 'log', message: `Case 1: 叔叔节点是红色，重新染色` };
                    this.setColor(parent, RBTColor.BLACK);
                    this.setColor(uncle, RBTColor.BLACK);
                    this.setColor(grandParent, RBTColor.RED);
                    yield { type: 'write', target: grandParent.id, message: `祖父染红，父叔染黑` };
                    z = grandParent;
                } else {
                    if (z === this.backend.read(parent, 'right')) {
                        // Case 2: Uncle is Black, z is right child
                        z = parent;
                        yield* this.rotateLeft(z);
                    }
                    // Case 3: Uncle is Black, z is left child
                    parent = this.getParent(z);
                    grandParent = this.getParent(parent);
                    yield { type: 'log', message: `Case 3: 叔叔节点是黑色，执行旋转并染色` };
                    this.setColor(parent, RBTColor.BLACK);
                    this.setColor(grandParent, RBTColor.RED);
                    yield* this.rotateRight(grandParent);
                }
            } else {
                // Symmetric cases
                let uncle = this.backend.read(grandParent, 'left');
                if (this.getColor(uncle) === RBTColor.RED) {
                    yield { type: 'log', message: `Case 1 (对称): 叔叔节点是红色，重新染色` };
                    this.setColor(parent, RBTColor.BLACK);
                    this.setColor(uncle, RBTColor.BLACK);
                    this.setColor(grandParent, RBTColor.RED);
                    yield { type: 'write', target: grandParent.id, message: `祖父染红，父叔染黑` };
                    z = grandParent;
                } else {
                    if (z === this.backend.read(parent, 'left')) {
                        z = parent;
                        yield* this.rotateRight(z);
                    }
                    parent = this.getParent(z);
                    grandParent = this.getParent(parent);
                    yield { type: 'log', message: `Case 3 (对称): 叔叔节点是黑色，执行旋转并染色` };
                    this.setColor(parent, RBTColor.BLACK);
                    this.setColor(grandParent, RBTColor.RED);
                    yield* this.rotateLeft(grandParent);
                }
            }
            if (z === this.backend.getRoot()) break;
        }

        const root = this.backend.getRoot();
        if (this.getColor(root) !== RBTColor.BLACK) {
            this.setColor(root, RBTColor.BLACK);
            yield { type: 'write', target: root.id, message: `根节点强制染黑` };
        }
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        this.backend.setPointer('current', current);
        while (current) {
            const currentVal = this.backend.read(current, 'value');
            yield { type: 'move_ptr', target: current.id, message: `查找 ${value}: 当前节点值为 ${currentVal}` };
            if (value === currentVal) {
                yield { type: 'highlight', target: current.id, message: `找到节点 ${value}！` };
                return;
            }
            current = value < currentVal ? this.backend.read(current, 'left') : this.backend.read(current, 'right');
            this.backend.setPointer('current', current);
        }
        yield { type: 'log', message: `未找到节点 ${value}` };
    }

    *delete(value: any): Generator<StepAction> {
        // RBT 删除逻辑比较复杂，这里先实现一个简化版或完整版
        // 为了演示效果，建议实现完整版
        let z = this.backend.getRoot();
        while (z) {
            const zVal = this.backend.read(z, 'value');
            if (value === zVal) break;
            z = value < zVal ? this.backend.read(z, 'left') : this.backend.read(z, 'right');
        }

        if (!z) {
            yield { type: 'log', message: `未找到要删除的节点: ${value}` };
            return;
        }

        yield { type: 'highlight', target: z.id, message: `准备删除节点: ${value}` };

        let y = z;
        let yOriginalColor = this.getColor(y);
        let x: any;

        if (!this.backend.read(z, 'left')) {
            x = this.backend.read(z, 'right');
            yield* this.transplant(z, x);
        } else if (!this.backend.read(z, 'right')) {
            x = this.backend.read(z, 'left');
            yield* this.transplant(z, x);
        } else {
            y = this.backend.read(z, 'right');
            while (this.backend.read(y, 'left')) {
                y = this.backend.read(y, 'left');
            }
            yOriginalColor = this.getColor(y);
            x = this.backend.read(y, 'right');
            
            if (this.getParent(y) === z) {
                if (x) this.setParent(x, y);
            } else {
                yield* this.transplant(y, x);
                this.backend.write(y, 'right', this.backend.read(z, 'right'));
                this.setParent(this.backend.read(y, 'right'), y);
            }
            yield* this.transplant(z, y);
            this.backend.write(y, 'left', this.backend.read(z, 'left'));
            this.setParent(this.backend.read(y, 'left'), y);
            this.setColor(y, this.getColor(z));
        }

        const zId = z.id;
        this.backend.free(z);
        yield { type: 'free', target: zId, message: `释放节点 ${value}` };

        if (yOriginalColor === RBTColor.BLACK) {
            yield* this.deleteFixup(x, this.getParent(x)); // 传递 parent 以防 x 为 null
        }
    }

    private *transplant(u: any, v: any): Generator<StepAction> {
        const uParent = this.getParent(u);
        if (!uParent) {
            this.backend.setRoot(v);
            this.backend.setPointer('root', v);
        } else if (u === this.backend.read(uParent, 'left')) {
            this.backend.write(uParent, 'left', v);
        } else {
            this.backend.write(uParent, 'right', v);
        }
        if (v) this.setParent(v, uParent);
        yield { type: 'log', message: `移植子树` };
    }

    private *deleteFixup(x: any, xParent: any): Generator<StepAction> {
        while (x !== this.backend.getRoot() && this.getColor(x) === RBTColor.BLACK) {
            if (x === this.backend.read(xParent, 'left')) {
                let w = this.backend.read(xParent, 'right');
                if (this.getColor(w) === RBTColor.RED) {
                    this.setColor(w, RBTColor.BLACK);
                    this.setColor(xParent, RBTColor.RED);
                    yield* this.rotateLeft(xParent);
                    w = this.backend.read(xParent, 'right');
                }
                if (this.getColor(this.backend.read(w, 'left')) === RBTColor.BLACK &&
                    this.getColor(this.backend.read(w, 'right')) === RBTColor.BLACK) {
                    this.setColor(w, RBTColor.RED);
                    x = xParent;
                    xParent = this.getParent(x);
                } else {
                    if (this.getColor(this.backend.read(w, 'right')) === RBTColor.BLACK) {
                        this.setColor(this.backend.read(w, 'left'), RBTColor.BLACK);
                        this.setColor(w, RBTColor.RED);
                        yield* this.rotateRight(w);
                        w = this.backend.read(xParent, 'right');
                    }
                    this.setColor(w, this.getColor(xParent));
                    this.setColor(xParent, RBTColor.BLACK);
                    this.setColor(this.backend.read(w, 'right'), RBTColor.BLACK);
                    yield* this.rotateLeft(xParent);
                    x = this.backend.getRoot();
                }
            } else {
                // Symmetric
                let w = this.backend.read(xParent, 'left');
                if (this.getColor(w) === RBTColor.RED) {
                    this.setColor(w, RBTColor.BLACK);
                    this.setColor(xParent, RBTColor.RED);
                    yield* this.rotateRight(xParent);
                    w = this.backend.read(xParent, 'left');
                }
                if (this.getColor(this.backend.read(w, 'right')) === RBTColor.BLACK &&
                    this.getColor(this.backend.read(w, 'left')) === RBTColor.BLACK) {
                    this.setColor(w, RBTColor.RED);
                    x = xParent;
                    xParent = this.getParent(x);
                } else {
                    if (this.getColor(this.backend.read(w, 'left')) === RBTColor.BLACK) {
                        this.setColor(this.backend.read(w, 'right'), RBTColor.BLACK);
                        this.setColor(w, RBTColor.RED);
                        yield* this.rotateLeft(w);
                        w = this.backend.read(xParent, 'left');
                    }
                    this.setColor(w, this.getColor(xParent));
                    this.setColor(xParent, RBTColor.BLACK);
                    this.setColor(this.backend.read(w, 'left'), RBTColor.BLACK);
                    yield* this.rotateRight(xParent);
                    x = this.backend.getRoot();
                }
            }
            if (!x) break;
        }
        if (x) {
            this.setColor(x, RBTColor.BLACK);
            yield { type: 'write', target: x.id, message: `最终修复染色` };
        }
    }
}
