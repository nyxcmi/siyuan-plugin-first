import type { JournalModule } from "./types";
import { dailyModule } from "./daily";
import { moodModule } from "./mood";

/**
 * 模块清单。
 *
 * 加一个新功能 = 新建 src/modules/xxx.ts 导出 xxxModule，然后在这里加一行。
 * index.ts 不用改。顺序 = 顶栏按钮从左到右的顺序。
 */
export const modules: JournalModule[] = [
  dailyModule,
  moodModule,
];

export * from "./types";
