import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class UserSearchScenario implements IScenario {
    id = "user_search";
    title = "Chapter 2: 用户 ID 检索挑战";
    description = "对比链表和二叉搜索树在查找特定 ID 时的效率。我们将先插入一组数据，然后查找一个位于末尾或不存在的值。";
    painPoint = "在 10,000 个数据中，链表需要遍历 10,000 次，而平衡后的树只需要 14 次左右。";

    getStages(): IStage[] {
        return [
            {
                id: 'prepare',
                title: '1. 准备测试数据',
                *run(structure: IDataStructure) {
                    const data = [50, 25, 75, 12, 37, 63, 87];
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
                id: 'search',
                title: '2. 检索挑战 (查找 87)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 开始挑战：检索值 87' };
                    const searchGen = structure.search(87);
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
