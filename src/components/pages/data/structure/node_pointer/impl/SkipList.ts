import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

export class SkipList implements IDataStructure {
    name = "跳表 (Skip List)";
    private backend!: IMemoryBackend;
    private maxLevel = 4;
    private p = 0.5;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        // Header node contains pointers for all levels
        const next = new Array(this.maxLevel).fill(null);
        const header = this.backend.malloc({ value: "Header", next, level: this.maxLevel });
        this.backend.setRoot(header);
        this.backend.setPointer('head', header);
    }

    private randomLevel(): number {
        let level = 1;
        while (Math.random() < this.p && level < this.maxLevel) {
            level++;
        }
        return level;
    }

    *insert(value: any): Generator<StepAction> {
        const header = this.backend.getRoot();
        const update = new Array(this.maxLevel).fill(header);
        let current = header;

        yield { type: 'log', message: `🚀 开始插入值 ${value}` };

        for (let i = this.maxLevel - 1; i >= 0; i--) {
            let next = this.backend.read(current, 'next')[i];
            while (next && this.backend.read(next, 'value') < value) {
                current = next;
                yield { type: 'move_ptr', target: current.id, message: `在 Level ${i} 向前移动` };
                next = this.backend.read(current, 'next')[i];
            }
            update[i] = current;
        }

        const level = this.randomLevel();
        const newNode = this.backend.malloc({ value, next: new Array(level).fill(null), level });
        yield { type: 'alloc', target: newNode.id, message: `创建新节点 ${value}，层高为 ${level}` };

        for (let i = 0; i < level; i++) {
            const prev = update[i];
            const nextPointers = this.backend.read(prev, 'next');
            const newNodePointers = this.backend.read(newNode, 'next');
            
            newNodePointers[i] = nextPointers[i];
            nextPointers[i] = newNode;
            
            this.backend.write(newNode, 'next', [...newNodePointers]);
            this.backend.write(prev, 'next', [...nextPointers]);
            
            yield { type: 'write', target: prev.id, message: `更新 Level ${i} 的指针` };
        }
    }

    *search(value: any): Generator<StepAction> {
        const header = this.backend.getRoot();
        let current = header;

        for (let i = this.maxLevel - 1; i >= 0; i--) {
            let next = this.backend.read(current, 'next')[i];
            yield { type: 'log', message: `从 Level ${i} 开始查找` };
            
            while (next && this.backend.read(next, 'value') < value) {
                current = next;
                yield { type: 'move_ptr', target: current.id, message: `在 Level ${i} 查找: ${this.backend.read(current, 'value')}` };
                next = this.backend.read(current, 'next')[i];
            }
        }

        current = this.backend.read(current, 'next')[0];
        if (current && this.backend.read(current, 'value') === value) {
            yield { type: 'highlight', target: current.id, message: `找到节点 ${value}！` };
        } else {
            yield { type: 'log', message: `未找到节点 ${value}` };
        }
    }

    *delete(value: any): Generator<StepAction> {
        const header = this.backend.getRoot();
        const update = new Array(this.maxLevel).fill(header);
        let current = header;

        for (let i = this.maxLevel - 1; i >= 0; i--) {
            let next = this.backend.read(current, 'next')[i];
            while (next && this.backend.read(next, 'value') < value) {
                current = next;
                next = this.backend.read(current, 'next')[i];
            }
            update[i] = current;
        }

        current = this.backend.read(current, 'next')[0];
        if (current && this.backend.read(current, 'value') === value) {
            const nodeId = current.id;
            const level = this.backend.read(current, 'level');
            for (let i = 0; i < level; i++) {
                const prev = update[i];
                const nextPointers = this.backend.read(prev, 'next');
                const targetNextPointers = this.backend.read(current, 'next');
                nextPointers[i] = targetNextPointers[i];
                this.backend.write(prev, 'next', [...nextPointers]);
                yield { type: 'write', target: prev.id, message: `从 Level ${i} 中断开节点` };
            }
            this.backend.free(current);
            yield { type: 'free', target: nodeId, message: `释放节点 ${value}` };
        }
    }
}
