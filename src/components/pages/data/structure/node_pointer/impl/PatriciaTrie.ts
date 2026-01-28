import { IDataStructure, IMemoryBackend, Pointer, StepAction } from '../core/types';

export class PatriciaTrie implements IDataStructure {
    name = "Patricia Trie (路径压缩)";
    private backend!: IMemoryBackend;
    private root: Pointer = null;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.root = this.backend.malloc({ prefix: "", isEndOfWord: false, children: {} });
        this.backend.setRoot(this.root);
    }

    *insert(word: string): Generator<StepAction> {
        yield { type: 'log', message: `开始插入 (Patricia): "${word}"` };
        
        let curr = this.root;
        const prefix = "app"; // 模拟路径压缩
        const newNode = this.backend.malloc({ prefix, isEndOfWord: false, children: {} });
        
        const children = this.backend.read(curr, 'children') || {};
        children[prefix[0]] = newNode;
        this.backend.write(curr, 'children', { ...children });

        yield { type: 'alloc', target: newNode, message: `路径压缩：合并公共前缀 "${prefix}"` };
        yield { type: 'highlight', target: newNode, message: "Patricia Trie 特性：一个节点代表一段字符串而非单个字符" };
    }

    *search(word: string): Generator<StepAction> {
        let curr = this.root;
        // ... 路径匹配逻辑 ...
        yield { type: 'log', message: `查找 (Patricia): "${word}"` };
    }

    *delete(word: string): Generator<StepAction> {
        yield { type: 'log', message: 'Patricia Trie 删除操作暂未实现' };
    }
}
