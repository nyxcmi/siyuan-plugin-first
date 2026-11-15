import type { JournalModule } from "./types";
import { moodModule } from "./mood";

/**
 * 模块清单。
 *
 * 加一个新功能 = 新建 src/modules/xxx.ts 导出 xxxModule，然后在这里加一行。
 * index.ts 不用改。
 */
export const modules: JournalModule[] = [
  moodModule,
];

export * from "./types";
