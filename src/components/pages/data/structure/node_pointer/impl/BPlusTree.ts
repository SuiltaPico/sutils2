import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class BPlusTree implements IDataStructure {
    name = "B+ 树";
    private backend!: IMemoryBackend;
    private order: number = 3; // 3阶 B+ 树，每个节点最多 2 个键，3 个子女

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.backend.setPointer('root', null);
    }

    *insert(value: any): Generator<StepAction> {
        let root = this.backend.getRoot();

        if (!root) {
            root = this.backend.malloc({
                keys: [value],
                isLeaf: true,
                next: null
            });
            this.backend.setRoot(root);
            this.backend.setPointer('root', root);
            yield { type: 'alloc', target: root.id, message: `创建 B+ 树根节点并插入: ${value}` };
            return;
        }

        // 查找叶子节点
        let leaf = yield* this.findLeaf(root, value);
        if (!leaf) return;
        let keys = this.backend.read(leaf, 'keys');

        // 如果值已存在，跳过（简单处理）
        if (keys.includes(value)) {
            yield { type: 'log', message: `值 ${value} 已存在` };
            return;
        }

        // 插入到叶子节点并保持排序
        keys.push(value);
        keys.sort((a: any, b: any) => a - b);
        this.backend.write(leaf, 'keys', keys);
        yield { type: 'write', target: leaf.id, message: `将 ${value} 插入叶子节点` };

        // 检查是否需要分裂
        if (keys.length >= this.order) {
            yield* this.split(leaf);
        }
    }

    private *findLeaf(node: any, value: any): Generator<StepAction, any> {
        if (!node) return null;
        this.backend.setPointer('current', node);
        let isLeaf = this.backend.read(node, 'isLeaf');
        
        if (isLeaf) {
            yield { type: 'move_ptr', target: node.id, message: `到达叶子节点` };
            return node;
        }

        let keys = this.backend.read(node, 'keys');
        let children = this.backend.read(node, 'children');
        yield { type: 'move_ptr', target: node.id, message: `在内部节点检索查找路径` };

        let i = 0;
        while (i < keys.length && value >= keys[i]) {
            i++;
        }

        if (!children || !children[i]) {
            yield { type: 'log', message: `错误：内部节点缺少子节点指针` };
            return null;
        }

        return yield* this.findLeaf(children[i], value);
    }

    private *split(node: any): Generator<StepAction> {
        yield { type: 'log', message: `节点键数量达到上限，触发分裂` };
        
        let keys = this.backend.read(node, 'keys');
        let isLeaf = this.backend.read(node, 'isLeaf');
        let mid = Math.floor(keys.length / 2);

        // 创建新节点
        let newNodeData: any = {
            isLeaf: isLeaf,
            keys: isLeaf ? keys.slice(mid) : keys.slice(mid + 1)
        };
        
        if (isLeaf) {
            newNodeData.next = this.backend.read(node, 'next');
        } else {
            let children = this.backend.read(node, 'children');
            newNodeData.children = children.slice(mid + 1);
            this.backend.write(node, 'children', children.slice(0, mid + 1));
        }

        let newNode = this.backend.malloc(newNodeData);
        yield { type: 'alloc', target: newNode.id, message: `分裂产生新节点` };

        // 更新原节点
        let upKey = keys[mid];
        this.backend.write(node, 'keys', keys.slice(0, isLeaf ? mid : mid));
        
        if (isLeaf) {
            this.backend.write(node, 'next', newNode);
            yield { type: 'write', target: node.id, message: `更新叶子节点链表指针` };
        }

        let parent = yield* this.getParent(this.backend.getRoot(), node);

        if (!parent) {
            // 原节点是根节点，需要创建新根
            let newRoot = this.backend.malloc({
                isLeaf: false,
                keys: [upKey],
                children: [node, newNode]
            });
            this.backend.setRoot(newRoot);
            this.backend.setPointer('root', newRoot);
            yield { type: 'alloc', target: newRoot.id, message: `创建新根节点` };
        } else {
            // 将中间键和新节点向上插入父节点
            let pKeys = this.backend.read(parent, 'keys');
            let pChildren = this.backend.read(parent, 'children');
            
            let idx = pChildren.indexOf(node);
            pKeys.splice(idx, 0, upKey);
            pChildren.splice(idx + 1, 0, newNode);
            
            this.backend.write(parent, 'keys', pKeys);
            this.backend.write(parent, 'children', pChildren);
            yield { type: 'write', target: parent.id, message: `将分裂信息向上传递给父节点` };

            if (pKeys.length >= this.order) {
                yield* this.split(parent);
            }
        }
    }

    private *getParent(current: any, target: any): Generator<StepAction, any> {
        if (!current || this.backend.read(current, 'isLeaf')) return null;

        let children = this.backend.read(current, 'children');
        if (children.includes(target)) return current;

        for (let child of children) {
            let p = yield* this.getParent(child, target);
            if (p) return p;
        }
        return null;
    }

    *search(value: any): Generator<StepAction> {
        let root = this.backend.getRoot();
        if (!root) return;

        let leaf = yield* this.findLeaf(root, value);
        let keys = this.backend.read(leaf, 'keys');

        if (keys.includes(value)) {
            yield { type: 'highlight', target: leaf.id, message: `在叶子节点找到值: ${value}` };
        } else {
            yield { type: 'log', message: `未找到值: ${value}` };
        }
    }

    *delete(value: any): Generator<StepAction> {
        yield { type: 'log', message: `B+ 树删除逻辑暂未实现 (由于其复杂性)` };
    }

    // 范围查询：B+ 树的核心优势
    *rangeSearch(start: any, end: any): Generator<StepAction> {
        yield { type: 'log', message: `开始范围查询: [${start}, ${end}]` };
        let root = this.backend.getRoot();
        if (!root) return;

        let current = yield* this.findLeaf(root, start);
        if (!current) {
            yield { type: 'log', message: `范围查询无法定位起始叶子节点` };
            return;
        }

        const visitedLeafIds = new Set<string>();
        let stepCount = 0;

        while (current) {
            if (visitedLeafIds.has(current.id)) {
                yield {
                    type: 'log',
                    message: '检测到叶子链表发生循环，停止范围查询'
                };
                break;
            }
            visitedLeafIds.add(current.id);

            if (++stepCount > 256) {
                yield {
                    type: 'log',
                    message: '范围查询访问次数超过上限，可能存在数据错误'
                };
                break;
            }

            let keys = this.backend.read(current, 'keys');
            yield { type: 'highlight', target: current.id, message: `检查叶子节点数据` };

            for (let key of keys) {
                if (key >= start && key <= end) {
                    yield { type: 'log', message: `找到范围内数据: ${key}` };
                }
                if (key > end) {
                    return;
                }
            }

            current = this.backend.read(current, 'next');
            if (current) {
                yield { type: 'move_ptr', target: current.id, message: `通过叶子链表移动到下一个节点` };
            }
        }
    }
}
