import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class SplayTree implements IDataStructure {
    name = "伸展树 (Splay Tree)";
    private backend!: IMemoryBackend;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    private getParent(node: any): any {
        return node ? this.backend.read(node, 'parent') : null;
    }

    private setParent(node: any, parent: any): void {
        if (node) this.backend.write(node, 'parent', parent);
    }

    private *rotateLeft(x: any): Generator<StepAction, any> {
        const y = this.backend.read(x, 'right');
        if (!y) return x;

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

        return y;
    }

    private *rotateRight(y: any): Generator<StepAction, any> {
        const x = this.backend.read(y, 'left');
        if (!x) return y;

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

        return x;
    }

    private *splay(x: any): Generator<StepAction> {
        while (this.getParent(x)) {
            const p = this.getParent(x);
            const g = this.getParent(p);
            
            yield { type: 'highlight', target: x.id, message: `正在伸展节点 ${this.backend.read(x, 'value')} 到根部` };

            if (!g) {
                // Zig case
                if (x === this.backend.read(p, 'left')) {
                    yield* this.rotateRight(p);
                } else {
                    yield* this.rotateLeft(p);
                }
            } else if (x === this.backend.read(p, 'left') && p === this.backend.read(g, 'left')) {
                // Zig-Zig case
                yield* this.rotateRight(g);
                yield* this.rotateRight(p);
            } else if (x === this.backend.read(p, 'right') && p === this.backend.read(g, 'right')) {
                // Zig-Zig case
                yield* this.rotateLeft(g);
                yield* this.rotateLeft(p);
            } else if (x === this.backend.read(p, 'right') && p === this.backend.read(g, 'left')) {
                // Zig-Zag case
                yield* this.rotateLeft(p);
                yield* this.rotateRight(g);
            } else {
                // Zig-Zag case
                yield* this.rotateRight(p);
                yield* this.rotateLeft(g);
            }
        }
    }

    *insert(value: any): Generator<StepAction> {
        let root = this.backend.getRoot();
        if (!root) {
            const newNode = this.backend.malloc({ value, left: null, right: null, parent: null });
            this.backend.setRoot(newNode);
            this.backend.setPointer('root', newNode);
            yield { type: 'alloc', target: newNode.id, message: `创建根节点: ${value}` };
            return;
        }

        let current = root;
        let parent: any = null;
        while (current) {
            parent = current;
            const currentVal = this.backend.read(current, 'value');
            if (value < currentVal) {
                current = this.backend.read(current, 'left');
            } else if (value > currentVal) {
                current = this.backend.read(current, 'right');
            } else {
                // Value exists, splay it
                yield* this.splay(current);
                return;
            }
        }

        const newNode = this.backend.malloc({ value, left: null, right: null, parent });
        yield { type: 'alloc', target: newNode.id, message: `插入新节点: ${value}` };
        
        if (value < this.backend.read(parent, 'value')) {
            this.backend.write(parent, 'left', newNode);
        } else {
            this.backend.write(parent, 'right', newNode);
        }

        yield* this.splay(newNode);
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        let lastNode = null;
        
        while (current) {
            lastNode = current;
            const currentVal = this.backend.read(current, 'value');
            yield { type: 'move_ptr', target: current.id, message: `查找 ${value}, 当前: ${currentVal}` };
            
            if (value === currentVal) {
                yield { type: 'highlight', target: current.id, message: `找到节点 ${value}，准备伸展到根部` };
                yield* this.splay(current);
                return;
            }
            
            current = value < currentVal ? this.backend.read(current, 'left') : this.backend.read(current, 'right');
        }

        if (lastNode) {
            yield { type: 'log', message: `未找到节点 ${value}，将最后访问的节点伸展到根部` };
            yield* this.splay(lastNode);
        }
    }

    *delete(value: any): Generator<StepAction> {
        // First splay the node to be deleted to the root
        yield* this.search(value);
        const root = this.backend.getRoot();
        if (!root || this.backend.read(root, 'value') !== value) return;

        const leftSubtree = this.backend.read(root, 'left');
        const rightSubtree = this.backend.read(root, 'right');
        const rootId = root.id;

        if (!leftSubtree) {
            this.backend.setRoot(rightSubtree);
            this.backend.setPointer('root', rightSubtree);
            if (rightSubtree) this.setParent(rightSubtree, null);
        } else {
            // Find max in left subtree, splay it to the root of the left subtree
            let maxInLeft = leftSubtree;
            while (this.backend.read(maxInLeft, 'right')) {
                maxInLeft = this.backend.read(maxInLeft, 'right');
            }
            
            // Temporary set leftSubtree as root to splay maxInLeft
            this.backend.setRoot(leftSubtree);
            this.setParent(leftSubtree, null);
            yield* this.splay(maxInLeft);
            
            // Now maxInLeft is the root of left subtree and has no right child
            const newRoot = this.backend.getRoot();
            this.backend.write(newRoot, 'right', rightSubtree);
            if (rightSubtree) this.setParent(rightSubtree, newRoot);
            this.backend.setPointer('root', newRoot);
        }

        this.backend.free(root);
        yield { type: 'free', target: rootId, message: `删除并释放原根节点 ${value}` };
    }
}
