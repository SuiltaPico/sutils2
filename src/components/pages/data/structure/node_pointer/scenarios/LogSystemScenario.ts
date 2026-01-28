import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class LogSystemScenario implements IScenario {
    id = "log_system";
    title = "序章 & Chapter 1: 即时日志系统";
    description = "模拟一个需要频繁在头部追加日志，并随机删除旧日志的场景。我们将对比定长数组和链表的表现。";
    painPoint = "数组在头部插入或删除时需要移动所有元素，且扩容时会产生巨大延迟。";

    getStages(): IStage[] {
        return [
            {
                id: 'prepare',
                title: '1. 准备数据 (插入 1-5)',
                *run(structure: IDataStructure) {
                    const data = [1, 5, 3, 8, 6, 7, 4, 2, 9];
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
                id: 'delete',
                title: '2. 删除特定节点 (删除 8)',
                *run(structure: IDataStructure) {
                    const delGen = structure.delete(8);
                    let delNext = delGen.next();
                    while (!delNext.done) {
                        yield delNext.value;
                        delNext = delGen.next();
                    }
                }
            }
        ];
    }
}
