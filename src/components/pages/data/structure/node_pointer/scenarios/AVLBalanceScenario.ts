import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class AVLBalanceScenario implements IScenario {
    id = "avl_balance";
    title = "Chapter 2+: 自动平衡的艺术 (AVL Tree)";
    description = "观察当数据以顺序插入（最坏情况）时，普通 BST 是如何退化成链表的，而 AVL 树又是如何通过旋转保持平衡的。";
    painPoint = "如果按 1, 2, 3... 顺序插入，普通 BST 会变成一个极长的单链表，查找效率从 O(log N) 崩塌至 O(N)。";

    getStages(): IStage[] {
        return [
            {
                id: 'sequential_insert',
                title: '1. 顺序插入挑战',
                *run(structure: IDataStructure) {
                    const data = [10, 20, 30, 40, 50];
                    yield { type: 'log', message: `🚀 开始顺序插入: ${data.join(', ')}` };
                    for (const val of data) {
                        const gen = structure.insert(val);
                        let next = gen.next();
                        while (!next.done) {
                            yield next.value;
                            next = gen.next();
                        }
                    }
                }
            },
            {
                id: 'search_last',
                title: '2. 效率对比 (查找 50)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 开始检索最后一个插入的值: 50' };
                    const searchGen = structure.search(50);
                    let sNext = searchGen.next();
                    while (!sNext.done) {
                        yield sNext.value;
                        sNext = searchGen.next();
                    }
                }
            }
        ];
    }
}
