import type { Plugin } from "siyuan";

/**
 * 插件里的一个功能模块。
 *
 * 约定：
 * - 每个模块一个文件，放在 src/modules/ 下
 * - setup 里注册自己的入口（顶栏按钮 / dock 面板 / 命令 / 事件）
 * - setup 可以返回一个 cleanup 函数，卸载插件时调用，用来移除自己加的 DOM
 * - 模块之间不直接引用，靠块属性和笔记本约定交换数据
 */
export interface JournalModule {
  /** 唯一标识，用户数据里会用到，别随便改 */
  id: string;
  /** 显示名 */
  name: string;
  /** 简单说明，用于设置页 */
  description?: string;
  setup(plugin: Plugin): void | (() => void) | Promise<void | (() => void)>;
}

export type ModuleCleanup = () => void;
