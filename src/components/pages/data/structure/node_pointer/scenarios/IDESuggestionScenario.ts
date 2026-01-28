import { IScenario, IStage } from '../core/scenario';
import { IDataStructure, StepAction } from '../core/types';

export class IDESuggestionScenario implements IScenario {
    id = "ide_suggestion";
    title = "Chapter 6: IDE 智能补全挑战";
    description = "对比普通列表遍历与 Trie 树在前缀搜索（补全）时的表现。";
    painPoint = "当 API 库有数万个函数时，线性遍历会导致明显的打字延迟；而 Trie 树只需沿着字母路径走几步。";

    getStages(): IStage[] {
        return [
            {
                id: 'init',
                title: '1. 注入 API 库',
                *run(structure: IDataStructure) {
                    const apis = ["apple", "apply", "application", "append", "banana", "band"];
                    for (const api of apis) {
                        const gen = structure.insert(api);
                        let n = gen.next();
                        while (!n.done) { yield n.value; n = gen.next(); }
                    }
                }
            },
            {
                id: 'suggest',
                title: '2. 输入 "app" 进行补全',
                *run(structure: IDataStructure) {
                    yield { type: 'log', message: '🚀 用户输入 "app"，正在检索匹配项...' };
                    const gen = structure.search("app");
                    let n = gen.next();
                    while (!n.done) { yield n.value; n = gen.next(); }
                }
            }
        ];
    }
}
