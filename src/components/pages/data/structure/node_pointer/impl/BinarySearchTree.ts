import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class BinarySearchTree implements IDataStructure {
    name = "二叉搜索树 (BST)";
    private backend!: IMemoryBackend;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    *insert(value: any): Generator<StepAction> {
        const root = this.backend.getRoot();
        if (!root) {
            const newNode = this.backend.malloc({ value, left: null, right: null });
            this.backend.setRoot(newNode);
            this.backend.setPointer('root', newNode);
            yield { type: 'alloc', target: newNode.id, message: `创建根节点: ${value}` };
            return;
        }

        let current = root;
        this.backend.setPointer('current', current);
        while (current) {
            const currentVal = this.backend.read(current, 'value');
            this.backend.setPointer('current', current);
            yield { type: 'move_ptr', target: current.id, message: `正在比较 ${value} 与 ${currentVal}` };

            if (value < currentVal) {
                const left = this.backend.read(current, 'left');
                if (!left) {
                    const newNode = this.backend.malloc({ value, left: null, right: null });
                    this.backend.write(current, 'left', newNode);
                    this.backend.setPointer('current', null);
                    yield { type: 'alloc', target: newNode.id, message: `在 ${currentVal} 的左侧插入 ${value}` };
                    return;
                }
                current = left;
            } else {
                const right = this.backend.read(current, 'right');
                if (!right) {
                    const newNode = this.backend.malloc({ value, left: null, right: null });
                    this.backend.write(current, 'right', newNode);
                    this.backend.setPointer('current', null);
                    yield { type: 'alloc', target: newNode.id, message: `在 ${currentVal} 的右侧插入 ${value}` };
                    return;
                }
                current = right;
            }
        }
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
        let parent: any = null;
        let current = this.backend.getRoot();
        let direction: 'left' | 'right' | 'root' = 'root';

        this.backend.setPointer('current', current);
        this.backend.setPointer('parent', parent);

        // 1. 查找节点
        while (current) {
            const currentVal = this.backend.read(current, 'value');
            this.backend.setPointer('current', current);
            this.backend.setPointer('parent', parent);
            yield { type: 'move_ptr', target: current.id, message: `正在查找值为 ${value} 的节点，当前节点值为 ${currentVal}` };

            if (currentVal === value) {
                yield { type: 'highlight', target: current.id, message: `找到目标节点 ${currentVal}` };
                break;
            }

            parent = current;
            if (value < currentVal) {
                direction = 'left';
                current = this.backend.read(current, 'left');
            } else {
                direction = 'right';
                current = this.backend.read(current, 'right');
            }
        }

        if (!current) {
            this.backend.setPointer('current', null);
            this.backend.setPointer('parent', null);
            yield { type: 'log', message: `未找到值为 ${value} 的节点，放弃删除` };
            return;
        }

        const left = this.backend.read(current, 'left');
        const right = this.backend.read(current, 'right');

        // 2. 情况 3: 节点有两个子女
        if (left && right) {
            yield { type: 'log', message: `节点有两个子女，寻找其后继节点（右子树中的最小值）` };
            
            let successorParent = current;
            let successor = right;
            this.backend.setPointer('successor', successor);
            yield { type: 'move_ptr', target: successor.id, message: `进入右子树` };

            let nextLeft = this.backend.read(successor, 'left');
            while (nextLeft) {
                successorParent = successor;
                successor = nextLeft;
                this.backend.setPointer('successor', successor);
                yield { type: 'move_ptr', target: successor.id, message: `向左搜寻后继节点...` };
                nextLeft = this.backend.read(successor, 'left');
            }

            const successorVal = this.backend.read(successor, 'value');
            yield { type: 'highlight', target: successor.id, message: `找到后继节点 ${successorVal}` };

            // 将后继节点的值复制到当前节点
            this.backend.write(current, 'value', successorVal);
            yield { type: 'write', target: current.id, message: `将后继节点的值 ${successorVal} 复制到当前节点` };

            // 转化为删除后继节点（后继节点最多有一个右子女）
            const successorRight = this.backend.read(successor, 'right');
            if (successorParent === current) {
                this.backend.write(current, 'right', successorRight);
                yield { type: 'write', target: current.id, message: `断开后继节点，将其右子女连接到当前节点的右侧` };
            } else {
                this.backend.write(successorParent, 'left', successorRight);
                yield { type: 'write', target: successorParent.id, message: `断开后继节点，将其右子女连接到其父节点的左侧` };
            }

            const successorId = successor.id;
            this.backend.free(successor);
            this.backend.setPointer('successor', null);
            this.backend.setPointer('current', null);
            this.backend.setPointer('parent', null);
            yield { type: 'free', target: successorId, message: `释放后继节点内存` };
            return;
        }

        // 3. 情况 1 & 2: 节点有零个或一个子女
        const child = left || right;
        const currentId = current.id;

        if (!parent) {
            this.backend.setRoot(child);
            this.backend.setPointer('root', child);
            yield { type: 'write', target: 'root', message: `删除根节点，新根节点为 ${child ? '子节点' : 'null'}` };
        } else if (direction === 'left') {
            this.backend.write(parent, 'left', child);
            yield { type: 'write', target: parent.id, message: `更新父节点 ${this.backend.read(parent, 'value')} 的左指针` };
        } else {
            this.backend.write(parent, 'right', child);
            yield { type: 'write', target: parent.id, message: `更新父节点 ${this.backend.read(parent, 'value')} 的右指针` };
        }

        this.backend.free(current);
        this.backend.setPointer('current', null);
        this.backend.setPointer('parent', null);
        yield { type: 'free', target: currentId, message: `释放节点 ${value} 的内存` };
    }

    *traverse(): Generator<any> {
        // 中序遍历
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
