import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class BTree implements IDataStructure {
    name: string;
    private backend!: IMemoryBackend;
    private order: number; // m 阶 B 树

    constructor(name: string = "B-Tree", order: number = 3) {
        this.name = name;
        this.order = order;
    }

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
                children: [],
                isLeaf: true
            });
            this.backend.setRoot(root);
            this.backend.setPointer('root', root);
            yield { type: 'alloc', target: root.id, message: `创建 ${this.name} 根节点并插入: ${value}` };
            return;
        }

        // 查找插入位置（总是插入到叶子节点）
        let path: any[] = [];
        let current = root;
        
        while (true) {
            this.backend.setPointer('current', current);
            let keys = this.backend.read(current, 'keys');
            
            if (keys.includes(value)) {
                yield { type: 'log', message: `值 ${value} 已存在` };
                return;
            }

            let isLeaf = this.backend.read(current, 'isLeaf');
            if (isLeaf) {
                yield { type: 'move_ptr', target: current.id, message: `到达叶子节点` };
                break;
            }

            path.push(current);
            let children = this.backend.read(current, 'children');
            let i = 0;
            while (i < keys.length && value > keys[i]) {
                i++;
            }
            yield { type: 'move_ptr', target: current.id, message: `在内部节点检索查找路径` };
            current = children[i];
        }

        // 插入到叶子节点
        let keys = this.backend.read(current, 'keys');
        keys.push(value);
        keys.sort((a: any, b: any) => a - b);
        this.backend.write(current, 'keys', keys);
        yield { type: 'write', target: current.id, message: `将 ${value} 插入叶子节点` };

        // 检查分裂
        if (keys.length >= this.order) {
            yield* this.split(current, path);
        }
    }

    private *split(node: any, path: any[]): Generator<StepAction> {
        yield { type: 'log', message: `节点键数量达到上限 (${this.order-1})，触发分裂` };
        
        let keys = this.backend.read(node, 'keys');
        let children = this.backend.read(node, 'children');
        let isLeaf = this.backend.read(node, 'isLeaf');
        
        let midIdx = Math.floor(keys.length / 2);
        let upKey = keys[midIdx];
        
        // 分裂成两个新节点（左边保留在原节点，右边创建新节点）
        let leftKeys = keys.slice(0, midIdx);
        let rightKeys = keys.slice(midIdx + 1);
        
        let leftChildren: any[] = [];
        let rightChildren: any[] = [];
        
        if (!isLeaf) {
            leftChildren = children.slice(0, midIdx + 1);
            rightChildren = children.slice(midIdx + 1);
        }

        // 更新原节点为左半部分
        this.backend.write(node, 'keys', leftKeys);
        if (!isLeaf) {
            this.backend.write(node, 'children', leftChildren);
        }
        yield { type: 'write', target: node.id, message: `原节点保留左半部分键值` };

        // 创建新节点为右半部分
        let newNode = this.backend.malloc({
            keys: rightKeys,
            children: rightChildren,
            isLeaf: isLeaf
        });
        yield { type: 'alloc', target: newNode.id, message: `分裂产生新节点，包含右半部分键值` };

        if (path.length === 0) {
            // node 是根节点，创建新根
            let newRoot = this.backend.malloc({
                keys: [upKey],
                children: [node, newNode],
                isLeaf: false
            });
            this.backend.setRoot(newRoot);
            this.backend.setPointer('root', newRoot);
            yield { type: 'alloc', target: newRoot.id, message: `创建新根节点，将中间键 ${upKey} 向上提升` };
        } else {
            // 将中间键向上插入父节点
            let parent = path.pop();
            let pKeys = this.backend.read(parent, 'keys');
            let pChildren = this.backend.read(parent, 'children');
            
            let idx = pChildren.indexOf(node);
            pKeys.splice(idx, 0, upKey);
            pChildren.splice(idx + 1, 0, newNode);
            
            this.backend.write(parent, 'keys', pKeys);
            this.backend.write(parent, 'children', pChildren);
            yield { type: 'write', target: parent.id, message: `将中间键 ${upKey} 提升至父节点` };

            if (pKeys.length >= this.order) {
                yield* this.split(parent, path);
            }
        }
    }

    *search(value: any): Generator<StepAction> {
        let root = this.backend.getRoot();
        if (!root) return;

        let current = root;
        while (current) {
            this.backend.setPointer('current', current);
            let keys = this.backend.read(current, 'keys');
            
            let i = 0;
            while (i < keys.length && value > keys[i]) {
                i++;
            }

            if (i < keys.length && keys[i] === value) {
                yield { type: 'highlight', target: current.id, message: `找到值: ${value}` };
                return;
            }

            let isLeaf = this.backend.read(current, 'isLeaf');
            if (isLeaf) {
                yield { type: 'log', message: `未找到值: ${value}` };
                return;
            }

            let children = this.backend.read(current, 'children');
            yield { type: 'move_ptr', target: current.id, message: `在节点内未找到，转向子节点` };
            current = children[i];
        }
    }

    *delete(value: any): Generator<StepAction> {
        yield { type: 'log', message: `B 树删除逻辑暂未实现` };
    }
}
