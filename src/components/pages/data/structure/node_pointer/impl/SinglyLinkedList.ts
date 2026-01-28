import { IDataStructure, IMemoryBackend, Pointer, StepAction } from '../core/types';

export class SinglyLinkedList implements IDataStructure {
    name = "单向链表";
    private backend!: IMemoryBackend;
    private tail: Pointer | null = null;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.backend.setRoot(null);
        this.tail = null;
        this.backend.setPointer('head', null);
        this.backend.setPointer('tail', null);
    }

    *insert(value: any): Generator<StepAction> {
        // 1. 分配新节点
        const newNode = this.backend.malloc({ value, next: null });
        yield { type: 'alloc', target: newNode.id, message: `准备追加新节点: ${value}` };

        const head = this.backend.getRoot();
        if (!head) {
            this.backend.setRoot(newNode);
            this.tail = newNode;
            this.backend.setPointer('head', newNode);
            this.backend.setPointer('tail', newNode);
            yield { type: 'write', target: 'root', message: '链表为空，直接设为头节点' };
            return;
        }

        // 2. 使用尾指针直接追加 (O(1) 演示)
        this.backend.setPointer('current', this.tail);
        yield { type: 'move_ptr', target: this.tail.id, message: '使用 tail 指针直接定位到末尾' };
        
        this.backend.write(this.tail, 'next', newNode);
        this.tail = newNode;
        this.backend.setPointer('tail', newNode);
        this.backend.setPointer('current', null);
        yield { type: 'write', target: newNode.id, message: `将旧尾节点的 next 指向新节点，并更新 tail` };
    }

    *search(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        let hopCount = 0;
        this.backend.setPointer('current', current);

        while (current) {
            hopCount++;
            const currentId = current.id;
            this.backend.setPointer('current', current);
            yield { 
                type: 'move_ptr', 
                target: currentId, 
                message: `正在进行第 ${hopCount} 次指针跳转...`,
                costs: { cpu: 5, memory: 80, disk: 0 }
            };
            
            const val = this.backend.read(current, 'value');
            if (val === value) {
                yield { type: 'highlight', target: currentId, message: `定位成功！共跳转 ${hopCount} 次` };
                this.backend.setPointer('current', null);
                return;
            }

            current = this.backend.read(current, 'next');
        }
        this.backend.setPointer('current', null);
        yield { type: 'log', message: '由于链表不支持随机访问，只能在遍历完所有节点后放弃。' };
    }

    *delete(value: any): Generator<StepAction> {
        let current = this.backend.getRoot();
        let prev: any = null;
        let hopCount = 0;

        yield { type: 'log', message: `🚀 开始在链表中寻找值为 ${value} 的节点...` };

        while (current) {
            hopCount++;
            const currentId = current.id;
            this.backend.setPointer('current', current);
            
            // 突出“游走”的动作
            yield { 
                type: 'move_ptr', 
                target: currentId, 
                message: `指针游走中 (第 ${hopCount} 次跳转)...`
            };

            const val = this.backend.read(current, 'value');
            if (val === value) {
                yield { type: 'highlight', target: currentId, message: `找到目标节点！历经 ${hopCount} 次跳转` };
                
                if (prev) {
                    const next = this.backend.read(current, 'next');
                    this.backend.write(prev, 'next', next);
                    // 如果删除的是尾节点，更新 tail
                    if (current === this.tail) {
                        this.tail = prev;
                        this.backend.setPointer('tail', prev);
                    }
                    yield { type: 'write', target: prev.id, message: '修改指针：将前驱节点的 next 指向当前节点的后继' };
                } else {
                    const next = this.backend.read(current, 'next');
                    this.backend.setRoot(next);
                    this.backend.setPointer('head', next);
                    // 如果删除的是唯一的节点
                    if (current === this.tail) {
                        this.tail = null;
                        this.backend.setPointer('tail', null);
                    }
                    yield { type: 'write', target: 'root', message: '删除的是头节点，直接更新头指针' };
                }
                
                this.backend.free(current);
                this.backend.setPointer('current', null);
                yield { type: 'free', target: currentId, message: '释放节点内存' };
                return;
            }

            yield { type: 'log', message: `节点值为 ${val}，非目标。准备读取 next 指针跳转...` };
            prev = current;
            current = this.backend.read(current, 'next');
        }
        
        this.backend.setPointer('current', null);
        yield { type: 'log', message: `遍历结束，未找到值为 ${value} 的节点。总计白跑了 ${hopCount} 次跳转。` };
    }
    
    // 遍历助手，用于验证或调试
    *traverse(): Generator<any> {
        let current = this.backend.getRoot();
        while (current) {
             yield this.backend.read(current, 'value');
             current = this.backend.read(current, 'next');
        }
    }
}
