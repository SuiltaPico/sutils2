import { IDataStructure, IMemoryBackend, Pointer, StepAction } from '../core/types';

export class Trie implements IDataStructure {
    name = "Trie (前缀树)";
    private backend!: IMemoryBackend;
    private root: Pointer = null;

    init(backend: IMemoryBackend): void {
        this.backend = backend;
        this.root = this.backend.malloc({ isEndOfWord: false, children: {} });
        this.backend.setRoot(this.root);
    }

    *insert(word: string): Generator<StepAction> {
        let curr = this.root;
        yield { type: 'highlight', target: curr, message: `开始插入单词: "${word}"` };

        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            const children = this.backend.read(curr, 'children') || {};
            
            if (!children[char]) {
                const newNode = this.backend.malloc({ char, isEndOfWord: false, children: {} });
                children[char] = newNode;
                this.backend.write(curr, 'children', { ...children });
                yield { type: 'alloc', target: newNode, message: `创建节点用于字符: '${char}'` };
            }

            curr = children[char];
            yield { type: 'move_ptr', target: curr, message: `移动到字符: '${char}'` };
        }

        this.backend.write(curr, 'isEndOfWord', true);
        yield { type: 'highlight', target: curr, message: `标记单词 "${word}" 结束` };
    }

    *search(word: string): Generator<StepAction> {
        let curr = this.root;
        yield { type: 'highlight', target: curr, message: `开始查找单词: "${word}"` };

        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            const children = this.backend.read(curr, 'children') || {};
            
            if (!children[char]) {
                yield { type: 'log', message: `未找到字符 '${char}'，单词 "${word}" 不存在` };
                return;
            }

            curr = children[char];
            yield { type: 'move_ptr', target: curr, message: `找到字符: '${char}'` };
        }

        const isEndOfWord = this.backend.read(curr, 'isEndOfWord');
        if (isEndOfWord) {
            yield { type: 'highlight', target: curr, message: `找到单词: "${word}"` };
        } else {
            yield { type: 'log', message: `前缀 "${word}" 存在，但不是完整单词` };
        }
    }

    *delete(word: string): Generator<StepAction> {
        // 简化实现：仅取消标记
        yield { type: 'log', message: 'Trie 删除操作暂未完全实现（仅做演示）' };
    }
}
