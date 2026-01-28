import { IDataStructure, IMemoryBackend, StepAction } from '../core/types';

/**
 * FixedArray 模拟定长数组
 * 
 * 它的目的是演示：
 * 1. 数组插入时的 O(N) 移动成本
 * 2. 数组满时的“全量拷贝”扩容成本
 */
export class FixedArray implements IDataStructure {
    name = "定长数组 (模拟)";
    private backend!: IMemoryBackend;
    private capacity = 2; // 初始容量设得很小，以便触发扩容演示
    private size = 0;
    private bufferPtr: any = null;
    private bufferVersion = 0; // 用于区分不同的内存块

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.size = 0;
        this.capacity = 2;
        this.bufferVersion = 1;
        // 分配初始 buffer
        this.bufferPtr = this.backend.malloc({ 
            type: 'array_buffer', 
            label: `定长数组 #${this.bufferVersion}`,
            capacity: this.capacity,
            elements: new Array(this.capacity).fill(null) 
        });
        this.backend.setRoot(this.bufferPtr);
        this.backend.setPointer('buffer', this.bufferPtr);
    }

    *insert(value: any): Generator<StepAction> {
        // 1. 检查是否需要扩容
        if (this.size >= this.capacity) {
            yield { type: 'log', message: '数组已满！启动扩容流程 (O(N) 操作)...' };
            
            const oldCapacity = this.capacity;
            const newCapacity = oldCapacity * 2;
            const oldBufferPtr = this.bufferPtr;

            this.bufferVersion++;
            // 申请新空间
            const newBufferPtr = this.backend.malloc({ 
                type: 'array_buffer', 
                label: `定长数组 #${this.bufferVersion}`,
                capacity: newCapacity,
                elements: new Array(newCapacity).fill(null)
            });
            this.backend.setPointer('new_buffer', newBufferPtr);
            yield { type: 'alloc', target: newBufferPtr.id, message: `分配新内存块 (新容量: ${newCapacity})` };

            // 拷贝数据 (O(N))
            const oldElements = this.backend.read(oldBufferPtr, 'elements');
            const newElements = this.backend.read(newBufferPtr, 'elements');

            for (let i = 0; i < this.size; i++) {
                newElements[i] = oldElements[i];
                this.backend.setPointer('src', oldBufferPtr, i);
                this.backend.setPointer('dst', newBufferPtr, i);
                yield { 
                    type: 'read', 
                    target: oldBufferPtr.id, 
                    message: `读取索引 ${i} 的旧数据...`,
                    payload: { index: i }
                };
                yield { 
                    type: 'write', 
                    target: newBufferPtr.id, 
                    message: `将数据拷贝到新内存索引 ${i}`,
                    payload: { index: i }
                };
            }

            // 更新引用
            this.capacity = newCapacity;
            this.bufferPtr = newBufferPtr;
            this.backend.setRoot(newBufferPtr);
            this.backend.setPointer('buffer', newBufferPtr);
            this.backend.setPointer('new_buffer', null);
            this.backend.setPointer('src', null);
            this.backend.setPointer('dst', null);

            // 释放旧空间
            const oldId = oldBufferPtr.id;
            this.backend.free(oldBufferPtr);
            yield { type: 'free', target: oldId, message: '释放旧内存块 (完成扩容)' };
        }

        // 2. 尾部插入
        const elements = this.backend.read(this.bufferPtr, 'elements');
        elements[this.size] = value;
        const targetIdx = this.size;
        this.size++;

        this.backend.setPointer('ptr', this.bufferPtr, targetIdx);
        yield { 
            type: 'write', 
            target: this.bufferPtr.id, 
            message: `在末尾索引 ${targetIdx} 处追加值: ${value}`,
            payload: { index: targetIdx, value }
        };
        this.backend.setPointer('ptr', null);
    }

    *search(value: any): Generator<StepAction> {
        const elements = this.backend.read(this.bufferPtr, 'elements');
        for (let i = 0; i < this.size; i++) {
            this.backend.setPointer('ptr', this.bufferPtr, i);
            yield { type: 'highlight', target: this.bufferPtr.id, message: `检查索引 ${i}`, payload: { index: i } };
            if (elements[i] === value) {
                yield { type: 'log', message: `找到值 ${value}，位于索引 ${i}！` };
                this.backend.setPointer('ptr', null);
                return;
            }
        }
        this.backend.setPointer('ptr', null);
        yield { type: 'log', message: `未找到值: ${value}` };
    }

    *delete(value: any): Generator<StepAction> {
        const elements = this.backend.read(this.bufferPtr, 'elements');
        let foundIdx = -1;

        // 1. 查找
        for (let i = 0; i < this.size; i++) {
            this.backend.setPointer('ptr', this.bufferPtr, i);
            if (elements[i] === value) {
                foundIdx = i;
                break;
            }
        }

        if (foundIdx === -1) {
            this.backend.setPointer('ptr', null);
            yield { type: 'log', message: '未找到待删除的值' };
            return;
        }

        // 2. 移动后续元素
        yield { type: 'log', message: `找到目标，位于索引 ${foundIdx}。开始平移后续元素以填补空缺...` };
        for (let i = foundIdx; i < this.size - 1; i++) {
            elements[i] = elements[i + 1];
            this.backend.setPointer('src', this.bufferPtr, i + 1);
            this.backend.setPointer('dst', this.bufferPtr, i);
            yield { 
                type: 'write', 
                target: this.bufferPtr.id, 
                message: `将索引 ${i+1} 的元素移至 ${i}`,
                payload: { from: i+1, to: i }
            };
        }

        elements[this.size - 1] = null;
        this.size--;
        this.backend.setPointer('src', null);
        this.backend.setPointer('dst', null);
        this.backend.setPointer('ptr', null);
        yield { type: 'log', message: '删除完成，数组大小减一' };
    }

    *traverse(): Generator<any> {
        const elements = this.backend.read(this.bufferPtr, 'elements');
        for (let i = 0; i < this.size; i++) {
            yield elements[i];
        }
    }
}
