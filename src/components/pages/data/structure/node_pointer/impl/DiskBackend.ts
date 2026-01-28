import { IMemoryBackend, Pointer, Snapshot, VisualNode, VisualEdge, DeviceCosts, StepAction, VisualPointer } from '../core/types';

export class DiskBackend implements IMemoryBackend {
    name = "Disk Mode (模拟硬盘/SSD 模式)";
    private nodes: Set<any> = new Set();
    private root: Pointer | null = null;
    private idCounter = 0;
    private pointers: Map<string, { target: Pointer, offset?: number }> = new Map();
    private lastAccessedNodeId: string | null = null;
    private pendingCosts: DeviceCosts = { cpu: 0, memory: 0, disk: 0 };

    private addPendingCost(type: StepAction['type'], target?: any) {
        const costs: Record<string, DeviceCosts> = {
            'read': { cpu: 10, memory: 100, disk: 10000 },
            'write': { cpu: 20, memory: 200, disk: 15000 },
            'alloc': { cpu: 100, memory: 500, disk: 50000 },
            'free': { cpu: 50, memory: 200, disk: 30000 },
            'move_ptr': { cpu: 5, memory: 5, disk: 0 },
            'highlight': { cpu: 1, memory: 0, disk: 0 },
            'log': { cpu: 0, memory: 0, disk: 0 }
        };

        const c = costs[type] || { cpu: 0, memory: 0, disk: 0 };
        let diskCost = c.disk;
        let memCost = c.memory;

        // Page 缓存逻辑
        if (target && (type === 'read' || type === 'write')) {
            const targetId = typeof target === 'string' ? target : target.id;
            if (targetId === this.lastAccessedNodeId) {
                diskCost = 0;
                memCost = 10;
            }
            this.lastAccessedNodeId = targetId;
        }

        this.pendingCosts.cpu += c.cpu;
        this.pendingCosts.memory += memCost;
        this.pendingCosts.disk += diskCost;
    }

    getCost(action: StepAction): DeviceCosts {
        // 先计算当前 action 的成本
        this.addPendingCost(action.type, action.target);
        
        // 返回并重置所有累积的成本
        const finalCosts = { ...this.pendingCosts };
        this.pendingCosts = { cpu: 0, memory: 0, disk: 0 };
        return finalCosts;
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

    reset(): void {
        this.nodes.clear();
        this.root = null;
        this.idCounter = 0;
        this.pointers.clear();
    }

    getSnapshot(): Snapshot {
        const visualNodes: VisualNode[] = [];
        const visualEdges: VisualEdge[] = [];
        const visualPointers: VisualPointer[] = [];

        for (const node of this.nodes) {
            let label = node.id.slice(0, 4);
            if (node.keys !== undefined && Array.isArray(node.keys)) {
                label = `[${node.keys.join(',')}]`;
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
