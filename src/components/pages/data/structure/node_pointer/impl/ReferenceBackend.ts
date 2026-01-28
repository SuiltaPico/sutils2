import { IMemoryBackend, Pointer, Snapshot, VisualNode, VisualEdge, DeviceCosts, StepAction, VisualPointer } from '../core/types';

export class ReferenceBackend implements IMemoryBackend {
    name = "引用模式 (JS 对象)";
    private nodes: Set<any> = new Set();
    private root: Pointer | null = null;
    private pointers: Map<string, { target: Pointer, offset?: number }> = new Map();
    
    // Counter for generating unique IDs
    private idCounter = 0;

    // 模拟 CPU L1/L2 缓存
    private activeNodes: string[] = []; 
    private lastOffsets: Map<string, number> = new Map();
    private pendingCosts: DeviceCosts = { cpu: 0, memory: 0, disk: 0 };

    private addPendingCost(type: StepAction['type'], target?: any, payload?: any) {
        const costs: Record<string, DeviceCosts> = {
            'read': { cpu: 1, memory: 10, disk: 0 },
            'write': { cpu: 2, memory: 12, disk: 0 },
            'alloc': { cpu: 10, memory: 50, disk: 0 },
            'free': { cpu: 5, memory: 20, disk: 0 },
            'highlight': { cpu: 1, memory: 0, disk: 0 },
            'move_ptr': { cpu: 1, memory: 1, disk: 0 },
            'log': { cpu: 0, memory: 0, disk: 0 }
        };

        const cost = { ...(costs[type] || { cpu: 0, memory: 0, disk: 0 }) };

        if (target && (type === 'read' || type === 'write' || type === 'move_ptr')) {
            const targetId = typeof target === 'string' ? target : (target as any).id;
            const currentOffset = payload?.index ?? payload?.offset;
            let isMiss = false;

            if (!this.activeNodes.includes(targetId)) {
                isMiss = true;
                this.activeNodes.push(targetId);
                if (this.activeNodes.length > 2) this.activeNodes.shift();
            } 
            else if (currentOffset !== undefined) {
                const lastOffset = this.lastOffsets.get(targetId);
                if (lastOffset !== undefined && Math.abs(currentOffset - lastOffset) > 1) {
                    isMiss = true;
                }
            }

            // if (isMiss) {
            //     cost.memory += 40;
            //     cost.cpu += 5; 
            // }

            if (currentOffset !== undefined) {
                this.lastOffsets.set(targetId, currentOffset);
            }
        }

        // this.pendingCosts.cpu += cost.cpu;
        // this.pendingCosts.memory += cost.memory;
        // this.pendingCosts.disk += cost.disk;
    }

    getCost(action: StepAction): DeviceCosts {
        this.addPendingCost(action.type, action.target, action.payload);
        const finalCosts = { ...this.pendingCosts };
        this.pendingCosts = { cpu: 0, memory: 0, disk: 0 };
        return finalCosts;
    }

    setPointer(name: string, target: Pointer | null, offset?: number): void {
        if (target === null) {
            this.pointers.delete(name);
        } else {
            this.pointers.set(name, { target, offset });
        }
    }

    getPointer(name: string): { target: Pointer, offset?: number } | null {
        return this.pointers.get(name) || null;
    }

    private generateId(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `node_${this.idCounter++}`;
    }

    malloc(data: any): Pointer {
        const node = {
            id: this.generateId(),
            ...data
        };
        this.nodes.add(node);
        this.addPendingCost('alloc', node);
        return node;
    }

    free(ptr: Pointer): void {
        if (this.nodes.has(ptr)) {
            this.addPendingCost('free', ptr);
            this.nodes.delete(ptr);
        }
        this.pointers.forEach((val, name) => {
            if (val.target === ptr) {
                this.pointers.delete(name);
            }
        });
    }

    read(ptr: Pointer, field: string): any {
        if (!ptr) throw new Error("Null pointer dereference");
        this.addPendingCost('read', ptr);
        return ptr[field];
    }

    write(ptr: Pointer, field: string, value: any): void {
        if (!ptr) throw new Error("Null pointer dereference");
        this.addPendingCost('write', ptr);
        ptr[field] = value;
    }

    getRoot(): Pointer | null {
        return this.root;
    }

    setRoot(ptr: Pointer | null): void {
        this.root = ptr;
    }

    reset(): void {
        this.nodes.clear();
        this.root = null;
        this.pointers.clear();
        this.idCounter = 0;
        this.activeNodes = [];
        this.lastOffsets.clear();
        this.pendingCosts = { cpu: 0, memory: 0, disk: 0 };
    }

    getSnapshot(): Snapshot {
        const visualNodes: VisualNode[] = [];
        const visualEdges: VisualEdge[] = [];
        const visualPointers: VisualPointer[] = [];

        for (const node of this.nodes) {
            let label = node.id.slice(0, 4);
            if (node.keys !== undefined && Array.isArray(node.keys)) {
                label = `[${node.keys.join(',')}]`;
            } else if (node.isBuckets) {
                label = "Buckets";
            } else if (node.char !== undefined) {
                label = String(node.char);
            } else if (node.prefix !== undefined) {
                label = String(node.prefix);
            } else if (node.value !== undefined) {
                label = String(node.value);
            } else if (node.key !== undefined) {
                label = String(node.key);
            }

            visualNodes.push({
                id: node.id,
                label: label,
                data: node
            });

            for (const key in node) {
                const value = node[key];
                if (this.nodes.has(value)) {
                    visualEdges.push({
                        from: node.id,
                        to: value.id,
                        label: key
                    });
                } else if (Array.isArray(value)) {
                    value.forEach((v, i) => {
                        if (this.nodes.has(v)) {
                            visualEdges.push({
                                from: node.id,
                                to: v.id,
                                label: `${key}[${i}]`
                            });
                        }
                    });
                } else if (value && typeof value === 'object') {
                    // 处理像 children: { 'a': nodePtr } 这样的 Map/Object 结构
                    for (const subKey in value) {
                        const subValue = value[subKey];
                        if (this.nodes.has(subValue)) {
                            visualEdges.push({
                                from: node.id,
                                to: subValue.id,
                                label: subKey
                            });
                        }
                    }
                }
            }
        }

        this.pointers.forEach((val, name) => {
            if (val.target && val.target.id) {
                visualPointers.push({
                    id: `ptr-${name}`,
                    label: name,
                    target: val.target.id,
                    offset: val.offset
                });
            }
        });

        return {
            nodes: visualNodes,
            edges: visualEdges,
            pointers: visualPointers
        };
    }
}
