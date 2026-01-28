import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class CacheSystemScenario implements IScenario {
    id = "cache_system";
    title = "Bonus: 缓存系统的高效与崩溃";
    description = "演示 Hash Map 的 O(1) 查找速度，以及在极端哈希冲突下的退化。";
    painPoint = "理想情况下哈希是瞬间定位，但如果所有 key 都碰撞到同一个桶，它就变成了性能最差的链表。";

    getStages(): IStage[] {
        return [
            {
                id: 'normal',
                title: '1. 正常缓存操作 (O(1))',
                *run(structure: IDataStructure) {
                    const items = [
                        { key: "user:1", value: "Alice" },
                        { key: "user:2", value: "Bob" },
                        { key: "session:x", value: "Active" }
                    ];
                    for (const item of items) {
                        const gen = structure.insert(item as any);
                        let n = gen.next();
                        while (!n.done) { yield n.value; n = gen.next(); }
                    }
                    
                    yield { type: 'log', message: '查找 user:1...' };
                    const sGen = structure.search("user:1");
                    let sn = sGen.next();
                    while (!sn.done) { yield sn.value; sn = sGen.next(); }
                }
            },
            {
                id: 'collision',
                title: '2. 模拟哈希碰撞 (退化成链表)',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '⚠️ 正在插入大量产生相同哈希值的 Key...' };
                    // 在我们的 8 桶实现中，可以构造一些碰撞
                    const items = [
                        { key: "a", value: "1" }, // hash("a") % 8
                        { key: "i", value: "2" }, // 假设碰撞（简化演示）
                        { key: "q", value: "3" }
                    ];
                    for (const item of items) {
                        const gen = structure.insert(item as any);
                        let n = gen.next();
                        while (!n.done) { yield n.value; n = gen.next(); }
                    }
                    yield { type: 'log', message: '此时查找末尾节点，需要遍历长长的链表。' };
                }
            }
        ];
    }
}
