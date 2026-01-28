import { IDataStructure, IMemoryBackend, Pointer, StepAction } from '../core/types';

export class DoublyLinkedList implements IDataStructure {
    name = "双向链表";
    private backend!: IMemoryBackend;
    private head: Pointer | null = null;
    private tail: Pointer | null = null;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.head = null;
        this.tail = null;
        this.backend.setPointer('head', null);
        this.backend.setPointer('tail', null);
    }

    *insert(value: any): Generator<StepAction> {
        // 1. 分配新节点
        const newNode = this.backend.malloc({ value, next: null, prev: null });
        yield { type: 'alloc', target: newNode.id, message: `分配新节点，值为: ${value}`, payload: { value } };

        if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
            this.backend.setRoot(newNode);
            this.backend.setPointer('head', newNode);
            this.backend.setPointer('tail', newNode);
            yield { type: 'write', target: 'root', message: '链表为空，直接设为头节点' };
            return;
        }

        // 2. 将新节点追加到尾部 (O(1) 演示)
        this.backend.setPointer('current', this.tail);
        yield { type: 'move_ptr', target: this.tail.id, message: '定位到当前尾节点' };

        this.backend.write(this.tail, 'next', newNode);
        this.backend.write(newNode, 'prev', this.tail);
        this.tail = newNode;
        
        this.backend.setPointer('tail', newNode);
        this.backend.setPointer('current', null);
        yield { type: 'write', target: newNode.id, message: '更新前后驱指针，并将 tail 指向新节点' };
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        while (current) {
            const currentId = current.id;
            yield { type: 'move_ptr', target: currentId, message: '向前遍历中...' };
            
            const val = this.backend.read(current, 'value');
            yield { type: 'read', target: currentId, message: `读取数据: ${val}` };

            if (val === value) {
                yield { type: 'highlight', target: currentId, message: '找到目标值！', payload: { success: true } };
                return;
            }

            current = this.backend.read(current, 'next');
        }
        yield { type: 'log', message: '未找到该值', payload: { success: false } };
    }

    *delete(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        let hopCount = 0;

        while (current) {
            hopCount++;
            const currentId = current.id;
            yield { type: 'move_ptr', target: currentId, message: `正在查找目标 (第 ${hopCount} 次跳转)...` };

            const val = this.backend.read(current, 'value');
            if (val === value) {
                yield { type: 'highlight', target: currentId, message: '找到目标值！' };
                const next = this.backend.read(current, 'next');
                const prev = this.backend.read(current, 'prev');

                if (prev) {
                    this.backend.write(prev, 'next', next);
                    yield { type: 'write', target: prev.id, message: '修改前驱节点的 next 指向后继节点' };
                } else {
                    this.head = next;
                    this.backend.setRoot(next);
                    this.backend.setPointer('head', next);
                    yield { type: 'write', target: 'root', message: '删除的是头节点，更新头指针' };
                }

                if (next) {
                    this.backend.write(next, 'prev', prev);
                    yield { type: 'write', target: next.id, message: '修改后继节点的 prev 指向前驱节点' };
                } else {
                    this.tail = prev;
                    this.backend.setPointer('tail', prev);
                    yield { type: 'write', target: 'root', message: '删除的是尾节点，更新尾指针' };
                }

                this.backend.free(current);
                yield { type: 'free', target: currentId, message: '释放节点内存' };
                return;
            }
            current = this.backend.read(current, 'next');
        }
        yield { type: 'log', message: '待删除的值不存在' };
    }

    *traverse(): Generator<any> {
        let current = this.backend.getRoot();
        while (current) {
            yield this.backend.read(current, 'value');
            current = this.backend.read(current, 'next');
        }
    }
}
