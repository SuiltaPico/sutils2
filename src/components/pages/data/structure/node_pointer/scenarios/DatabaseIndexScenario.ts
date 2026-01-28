import { IScenario, IStage } from "../core/scenario";
import { IDataStructure, StepAction } from "../core/types";
import { BPlusTree } from "../impl/BPlusTree";

export class DatabaseIndexScenario implements IScenario {
  id = "database_index";
  title = "Chapter 4: 亿级数据库索引挑战";
  description =
    "模拟数据库中的范围查询。对比二叉树与 B+ 树在处理磁盘 I/O 时的巨大差异。";
  painPoint =
    "二叉树太高，每次找数据都要多次磁盘 I/O。B+ 树通过多叉和叶子链表，极大地减少了 Page Faults。";

  getStages(): IStage[] {
    return [
      {
        id: "bulk_insert",
        title: "1. 构建索引 (插入数据)",
        *run(structure: IDataStructure) {
          const data = Array.from({ length: 20 }, (_, i) => i * 10);
          yield {
            type: "log",
            message: `🚀 正在向数据库插入数据并构建索引...`,
          };
          for (const val of data) {
            const gen = structure.insert(val);
            let next = gen.next();
            while (!next.done) {
              yield next.value;
              next = gen.next();
            }
          }
        },
      },
      {
        id: "range_query",
        title: "2. 范围查询挑战 (35 - 85)",
        *run(structure: IDataStructure) {
        //   yield {
        //     type: "log",
        //     message:
        //       "🔍 执行 SQL: SELECT * FROM table WHERE id BETWEEN 35 AND 85",
        //   };

          if (structure instanceof BPlusTree) {
            const gen = structure.rangeSearch(35, 85);
            let next = gen.next();
            while (!next.done) {
              yield next.value;
              next = gen.next();
            }
          } else {
            yield {
              type: "log",
              message: "普通树结构不支持高效范围查询，将通过多次搜索模拟...",
            };
            for (let val = 40; val <= 80; val += 10) {
              const gen = structure.search(val);
              let next = gen.next();
              while (!next.done) {
                yield next.value;
                next = gen.next();
              }
            }
          }
        },
      },
    ];
  }
}
