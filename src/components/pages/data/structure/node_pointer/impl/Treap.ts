import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class Treap implements IDataStructure {
    name = "树堆 (Treap)";
    private backend!: IMemoryBackend;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    private getPriority(node: any): number {
        return node ? this.backend.read(node, 'priority') : -1;
    }

    private *rotateLeft(x: any): Generator<StepAction, any> {
        const y = this.backend.read(x, 'right');
        const T2 = this.backend.read(y, 'left');

        this.backend.write(y, 'left', x);
        this.backend.write(x, 'right', T2);

        return y;
    }

    private *rotateRight(y: any): Generator<StepAction, any> {
        const x = this.backend.read(y, 'left');
        const T2 = this.backend.read(x, 'right');

        this.backend.write(x, 'right', y);
        this.backend.write(y, 'left', T2);

        return x;
    }

    *insert(value: any): Generator<StepAction> {
        const priority = Math.floor(Math.random() * 100);
        const root = this.backend.getRoot();
        const newRoot = yield* this._insert(root, value, priority);
        this.backend.setRoot(newRoot);
        this.backend.setPointer('root', newRoot);
    }

    private * _insert(node: any, value: any, priority: number): Generator<StepAction, any> {
        if (!node) {
            const newNode = this.backend.malloc({ value, priority, left: null, right: null });
            yield { type: 'alloc', target: newNode.id, message: `插入新节点 ${value} (优先级: ${priority})` };
            return newNode;
        }

        const currentVal = this.backend.read(node, 'value');
        this.backend.setPointer('current', node);

        if (value < currentVal) {
            const left = this.backend.read(node, 'left');
            const newLeft = yield* this._insert(left, value, priority);
            this.backend.write(node, 'left', newLeft);
            
            if (this.getPriority(newLeft) > this.getPriority(node)) {
                yield { type: 'log', message: `优先级冲突 (${this.getPriority(newLeft)} > ${this.getPriority(node)})，执行右旋` };
                return yield* this.rotateRight(node);
            }
        } else if (value > currentVal) {
            const right = this.backend.read(node, 'right');
            const newRight = yield* this._insert(right, value, priority);
            this.backend.write(node, 'right', newRight);

            if (this.getPriority(newRight) > this.getPriority(node)) {
                yield { type: 'log', message: `优先级冲突 (${this.getPriority(newRight)} > ${this.getPriority(node)})，执行左旋` };
                return yield* this.rotateLeft(node);
            }
        }

        return node;
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        while (current) {
            const currentVal = this.backend.read(current, 'value');
            yield { type: 'move_ptr', target: current.id, message: `查找 ${value}, 当前: ${currentVal}` };
            if (value === currentVal) {
                yield { type: 'highlight', target: current.id, message: `找到节点 ${value}！` };
                return;
            }
            current = value < currentVal ? this.backend.read(current, 'left') : this.backend.read(current, 'right');
        }
        yield { type: 'log', message: `未找到节点 ${value}` };
    }

    *delete(value: any): Generator<StepAction> {
        const root = this.backend.getRoot();
        const newRoot = yield* this._delete(root, value);
        this.backend.setRoot(newRoot);
        this.backend.setPointer('root', newRoot);
    }

    private * _delete(node: any, value: any): Generator<StepAction, any> {
        if (!node) return null;

        const currentVal = this.backend.read(node, 'value');
        if (value < currentVal) {
            const left = this.backend.read(node, 'left');
            this.backend.write(node, 'left', yield* this._delete(left, value));
        } else if (value > currentVal) {
            const right = this.backend.read(node, 'right');
            this.backend.write(node, 'right', yield* this._delete(right, value));
        } else {
            // Found node
            yield { type: 'highlight', target: node.id, message: `准备删除节点 ${value}` };
            const left = this.backend.read(node, 'left');
            const right = this.backend.read(node, 'right');

            if (!left) {
                const temp = right;
                const nodeId = node.id;
                this.backend.free(node);
                yield { type: 'free', target: nodeId, message: `删除节点并提升右子树` };
                return temp;
            } else if (!right) {
                const temp = left;
                const nodeId = node.id;
                this.backend.free(node);
                yield { type: 'free', target: nodeId, message: `删除节点并提升左子树` };
                return temp;
            } else if (this.getPriority(left) < this.getPriority(right)) {
                const newNode = yield* this.rotateLeft(node);
                const newLeft = this.backend.read(newNode, 'left');
                this.backend.write(newNode, 'left', yield* this._delete(newLeft, value));
                return newNode;
            } else {
                const newNode = yield* this.rotateRight(node);
                const newRight = this.backend.read(newNode, 'right');
                this.backend.write(newNode, 'right', yield* this._delete(newRight, value));
                return newNode;
            }
        }
        return node;
    }
}
