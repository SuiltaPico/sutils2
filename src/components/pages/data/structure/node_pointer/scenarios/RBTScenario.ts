import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class RBTScenario implements IScenario {
    id = "rbt_demo";
    title = "Chapter 2++: 工业界的标准 (Red-Black Tree)";
    description = "红黑树通过较弱的平衡条件减少了 AVL 树频繁旋转的开销。观察它在连续插入时如何通过变色和少量旋转维持平衡。";
    painPoint = "AVL 树追求绝对平衡，导致插入/删除时旋转次数较多。红黑树在维护成本和查询效率间取得了更好的折中。";

    getStages(): IStage[] {
        return [
            {
                id: 'insert_sequence',
                title: '1. 复杂插入序列',
                *run(structure: IDataStructure) {
                    const data = [10, 20, 30, 15, 25, 5, 1];
                    yield { type: 'log', message: `🚀 开始插入序列: ${data.join(', ')}` };
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
                id: 'delete_root',
                title: '2. 删除操作 (删除 20)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 删除节点 20，观察红黑平衡修复' };
                    const delGen = structure.delete(20);
                    let dNext = delGen.next();
                    while (!dNext.done) {
                        yield dNext.value;
                        dNext = delGen.next();
                    }
                }
            }
        ];
    }
}
