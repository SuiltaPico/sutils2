import { IDataStructure, IMemoryBackend, Pointer, StepAction } from '../core/types';

export class HashMap implements IDataStructure {
    name = "Hash Map (拉链法)";
    private backend!: IMemoryBackend;
    private buckets: Pointer = null;
    private size = 8;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        const bucketArray = new Array(this.size).fill(null);
        this.buckets = this.backend.malloc({ isBuckets: true, values: bucketArray });
        this.backend.setRoot(this.buckets);
    }

    private hash(key: string): number {
        let h = 0;
        for (let i = 0; i < key.length; i++) {
            h = (h << 5) - h + key.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h) % this.size;
    }

    *insert(item: { key: string, value: any }): Generator<StepAction> {
        const { key, value } = item;
        const index = this.hash(key);
        yield { type: 'log', message: `计算哈希: "${key}" -> index ${index}` };

        const bucketValues = this.backend.read(this.buckets, 'values');
        let head = bucketValues[index];

        const newNode = this.backend.malloc({ key, value, next: head });
        bucketValues[index] = newNode;
        this.backend.write(this.buckets, 'values', [...bucketValues]);

        yield { type: 'alloc', target: newNode, message: `插入到桶 ${index}` };
    }

    *search(key: string): Generator<StepAction> {
        const index = this.hash(key);
        yield { type: 'log', message: `查找哈希: "${key}" -> index ${index}` };

        const bucketValues = this.backend.read(this.buckets, 'values');
        let curr = bucketValues[index];

        while (curr) {
            yield { type: 'move_ptr', target: curr, message: `检查桶 ${index} 中的节点: ${this.backend.read(curr, 'key')}` };
            if (this.backend.read(curr, 'key') === key) {
                yield { type: 'highlight', target: curr, message: `找到目标! Key: ${key}, Value: ${this.backend.read(curr, 'value')}` };
                return;
            }
            curr = this.backend.read(curr, 'next');
        }

        yield { type: 'log', message: `未找到 Key: ${key}` };
    }

    *delete(key: string): Generator<StepAction> {
        const index = this.hash(key);
        const bucketValues = this.backend.read(this.buckets, 'values');
        let curr = bucketValues[index];
        let prev = null;

        while (curr) {
            if (this.backend.read(curr, 'key') === key) {
                if (prev) {
                    this.backend.write(prev, 'next', this.backend.read(curr, 'next'));
                } else {
                    bucketValues[index] = this.backend.read(curr, 'next');
                    this.backend.write(this.buckets, 'values', [...bucketValues]);
                }
                const targetId = curr.id;
                this.backend.free(curr);
                yield { type: 'free', target: targetId, message: `删除 Key: ${key}` };
                return;
            }
            prev = curr;
            curr = this.backend.read(curr, 'next');
        }
    }
}
