import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class HotCacheScenario implements IScenario {
    id = "hot_cache";
    title = "Chapter 3: 热点缓存系统 (Hot Cache)";
    description = "演示在符合 80/20 法则的数据访问中，伸展树 (Splay Tree) 如何通过将热点数据移动到根部来极大提升访问速度。";
    painPoint = "普通二叉搜索树或红黑树对所有节点一视同仁，即便某个数据被频繁访问，它在树中的深度依然保持不变，导致重复的查找开销。";

    getStages(): IStage[] {
        return [
            {
                id: 'prepare',
                title: '1. 构建数据索引',
                *run(structure: IDataStructure) {
                    const data = [10, 20, 30, 40, 50, 60, 70, 80];
                    yield { type: 'log', message: `🚀 正在构建索引: ${data.join(', ')}` };
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
                id: 'access_hot',
                title: '2. 频繁访问热点 (20)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 连续 3 次访问同一个热点数据: 20' };
                    for (let i = 1; i <= 3; i++) {
                        yield { type: 'log', message: `第 ${i} 次访问 20` };
                        const searchGen = structure.search(20);
                        let sNext = searchGen.next();
                        while (!sNext.done) {
                            yield sNext.value;
                            sNext = searchGen.next();
                        }
                    }
                }
            },
            {
                id: 'access_cold',
                title: '3. 访问冷数据 (80)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 访问一个冷数据: 80，观察它如何变成新的热点' };
                    const searchGen = structure.search(80);
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
