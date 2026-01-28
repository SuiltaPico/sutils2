import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class AVLTree implements IDataStructure {
    name = "AVL 树";
    private backend!: IMemoryBackend;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    private getHeight(node: any): number {
        if (!node) return 0;
        return this.backend.read(node, 'height') || 1;
    }

    private getBalance(node: any): number {
        if (!node) return 0;
        return this.getHeight(this.backend.read(node, 'left')) - this.getHeight(this.backend.read(node, 'right'));
    }

    private updateHeight(node: any): void {
        const leftHeight = this.getHeight(this.backend.read(node, 'left'));
        const rightHeight = this.getHeight(this.backend.read(node, 'right'));
        this.backend.write(node, 'height', Math.max(leftHeight, rightHeight) + 1);
    }

    private *rotateRight(y: any): Generator<StepAction, any> {
        const x = this.backend.read(y, 'left');
        const T2 = this.backend.read(x, 'right');

        yield { type: 'log', message: `对节点 ${this.backend.read(y, 'value')} 执行右旋` };

        // 执行旋转
        this.backend.write(x, 'right', y);
        this.backend.write(y, 'left', T2);

        // 更新高度
        this.updateHeight(y);
        this.updateHeight(x);

        yield { type: 'write', target: x.id, message: `右旋完成，新根节点为 ${this.backend.read(x, 'value')}` };
        return x;
    }

    private *rotateLeft(x: any): Generator<StepAction, any> {
        const y = this.backend.read(x, 'right');
        const T2 = this.backend.read(y, 'left');

        yield { type: 'log', message: `对节点 ${this.backend.read(x, 'value')} 执行左旋` };

        // 执行旋转
        this.backend.write(y, 'left', x);
        this.backend.write(x, 'right', T2);

        // 更新高度
        this.updateHeight(x);
        this.updateHeight(y);

        yield { type: 'write', target: y.id, message: `左旋完成，新根节点为 ${this.backend.read(y, 'value')}` };
        return y;
    }

    *insert(value: any): Generator<StepAction> {
        const root = this.backend.getRoot();
        if (!root) {
            const newNode = this.backend.malloc({ value, left: null, right: null, height: 1 });
            this.backend.setRoot(newNode);
            this.backend.setPointer('root', newNode);
            yield { type: 'alloc', target: newNode.id, message: `创建根节点: ${value}` };
            return;
        }

        const newRoot = yield* this._insert(root, value);
        this.backend.setRoot(newRoot);
        this.backend.setPointer('root', newRoot);
    }

    private * _insert(node: any, value: any): Generator<StepAction, any> {
        if (!node) {
            const newNode = this.backend.malloc({ value, left: null, right: null, height: 1 });
            yield { type: 'alloc', target: newNode.id, message: `创建新节点: ${value}` };
            return newNode;
        }

        const currentVal = this.backend.read(node, 'value');
        this.backend.setPointer('current', node);
        yield { type: 'move_ptr', target: node.id, message: `比较 ${value} 与 ${currentVal}` };

        if (value < currentVal) {
            const left = this.backend.read(node, 'left');
            const newLeft = yield* this._insert(left, value);
            this.backend.write(node, 'left', newLeft);
        } else if (value > currentVal) {
            const right = this.backend.read(node, 'right');
            const newRight = yield* this._insert(right, value);
            this.backend.write(node, 'right', newRight);
        } else {
            yield { type: 'log', message: `值 ${value} 已存在，跳过插入` };
            return node;
        }

        // 2. 更新高度
        this.updateHeight(node);

        // 3. 获取平衡因子并检查平衡
        const balance = this.getBalance(node);
        yield { type: 'log', message: `节点 ${currentVal} 的平衡因子为 ${balance}` };

        // 如果不平衡，则进行旋转
        // Left Left Case
        if (balance > 1 && value < this.backend.read(this.backend.read(node, 'left'), 'value')) {
            return yield* this.rotateRight(node);
        }

        // Right Right Case
        if (balance < -1 && value > this.backend.read(this.backend.read(node, 'right'), 'value')) {
            return yield* this.rotateLeft(node);
        }

        // Left Right Case
        if (balance > 1 && value > this.backend.read(this.backend.read(node, 'left'), 'value')) {
            const left = this.backend.read(node, 'left');
            const newLeft = yield* this.rotateLeft(left);
            this.backend.write(node, 'left', newLeft);
            return yield* this.rotateRight(node);
        }

        // Right Left Case
        if (balance < -1 && value < this.backend.read(this.backend.read(node, 'right'), 'value')) {
            const right = this.backend.read(node, 'right');
            const newRight = yield* this.rotateRight(right);
            this.backend.write(node, 'right', newRight);
            return yield* this.rotateLeft(node);
        }

        return node;
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        this.backend.setPointer('current', current);
        while (current) {
            const currentId = current.id;
            this.backend.setPointer('current', current);
            const currentVal = this.backend.read(current, 'value');
            yield { type: 'move_ptr', target: currentId, message: `检查节点: ${currentVal}` };

            if (currentVal === value) {
                yield { type: 'highlight', target: currentId, message: `找到目标值: ${value}！` };
                return;
            }

            if (value < currentVal) {
                yield { type: 'log', message: `${value} < ${currentVal}，转向左子树` };
                current = this.backend.read(current, 'left');
            } else {
                yield { type: 'log', message: `${value} > ${currentVal}，转向右子树` };
                current = this.backend.read(current, 'right');
            }
        }
        this.backend.setPointer('current', null);
        yield { type: 'log', message: `未找到值: ${value}` };
    }

    *delete(value: any): Generator<StepAction> {
        const root = this.backend.getRoot();
        if (!root) return;

        const newRoot = yield* this._delete(root, value);
        this.backend.setRoot(newRoot);
        this.backend.setPointer('root', newRoot);
    }

    private * _delete(node: any, value: any): Generator<StepAction, any> {
        if (!node) return node;

        const currentVal = this.backend.read(node, 'value');
        this.backend.setPointer('current', node);

        if (value < currentVal) {
            const left = this.backend.read(node, 'left');
            const newLeft = yield* this._delete(left, value);
            this.backend.write(node, 'left', newLeft);
        } else if (value > currentVal) {
            const right = this.backend.read(node, 'right');
            const newRight = yield* this._delete(right, value);
            this.backend.write(node, 'right', newRight);
        } else {
            // 找到节点
            yield { type: 'highlight', target: node.id, message: `找到待删除节点: ${currentVal}` };
            const left = this.backend.read(node, 'left');
            const right = this.backend.read(node, 'right');

            if (!left || !right) {
                const temp = left || right;
                const nodeId = node.id;
                this.backend.free(node);
                yield { type: 'free', target: nodeId, message: `删除节点 ${currentVal}` };
                return temp;
            } else {
                // 有两个子节点，找到中序后继
                let successor = right;
                while (this.backend.read(successor, 'left')) {
                    successor = this.backend.read(successor, 'left');
                }
                const successorVal = this.backend.read(successor, 'value');
                yield { type: 'log', message: `找到后继节点: ${successorVal}` };
                
                this.backend.write(node, 'value', successorVal);
                yield { type: 'write', target: node.id, message: `将后继节点的值复制到当前节点` };

                const newRight = yield* this._delete(right, successorVal);
                this.backend.write(node, 'right', newRight);
            }
        }

        if (!node) return node;

        // 更新高度
        this.updateHeight(node);

        // 检查平衡
        const balance = this.getBalance(node);
        if (balance > 1 && this.getBalance(this.backend.read(node, 'left')) >= 0) {
            return yield* this.rotateRight(node);
        }

        if (balance > 1 && this.getBalance(this.backend.read(node, 'left')) < 0) {
            const left = this.backend.read(node, 'left');
            const newLeft = yield* this.rotateLeft(left);
            this.backend.write(node, 'left', newLeft);
            return yield* this.rotateRight(node);
        }

        if (balance < -1 && this.getBalance(this.backend.read(node, 'right')) <= 0) {
            return yield* this.rotateLeft(node);
        }

        if (balance < -1 && this.getBalance(this.backend.read(node, 'right')) > 0) {
            const right = this.backend.read(node, 'right');
            const newRight = yield* this.rotateRight(right);
            this.backend.write(node, 'right', newRight);
            return yield* this.rotateLeft(node);
        }

        return node;
    }

    *traverse(): Generator<any> {
        const stack: any[] = [];
        let current = this.backend.getRoot();
        while (current || stack.length > 0) {
            while (current) {
                stack.push(current);
                current = this.backend.read(current, 'left');
            }
            current = stack.pop();
            yield this.backend.read(current, 'value');
            current = this.backend.read(current, 'right');
        }
    }
}
