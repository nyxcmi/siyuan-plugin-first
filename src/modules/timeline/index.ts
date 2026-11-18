/**
 * 时间轴 · 面板
 *
 * 侧栏 dock，两个 tab：
 *   - 时间轴：按天合并，紧凑，用来定位
 *   - 连续阅读：按条展开，用来沉浸读
 *
 * 本版只做「读 + 看 + 跳转」，不修改任何文档。
 */
import type { Plugin } from "siyuan";
import { openTab } from "siyuan";
import type { JournalModule } from "../types";
import { lsNotebooks } from "../../api";
import { loadEntries, groupByDay, formatDisplay, type DiaryEntry } from "./entries";

const CONF_KEY = "daily-config";

async function resolveNotebook(plugin: Plugin): Promise<string> {
  const cfg = await plugin.loadData(CONF_KEY).catch(() => null);
  if (cfg?.notebook) return cfg.notebook;

  // 兜底：找名字里带 daily / 日记 的笔记本
  try {
    const res: any = await lsNotebooks();
    const list: any[] = res?.notebooks ?? [];
    const hit = list.find(n => /daily|日记/i.test(n.name ?? ""));
    if (hit) return hit.id;
  } catch {
    /* 忽略 */
  }
  return "";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

interface PanelState {
  entries: DiaryEntry[];
  tab: "axis" | "read";
}

function renderAxis(state: PanelState, root: HTMLElement, plugin: Plugin): void {
  const box = el("div", "tl-list");
  const groups = groupByDay(state.entries);

  const days = Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)); // 新 → 旧

  if (!days.length) {
    box.appendChild(el("div", "tl-empty", "没有找到条目。先在设置里选日记笔记本，或按标准格式 2026-11-18 写一篇。"));
  }

  for (const [key, list] of days) {
    const row = el("div", "tl-row");
    const head = el("div", "tl-date", formatDisplay(list[0].date));
    row.appendChild(head);

    const meta = el("div", "tl-meta", list.length > 1 ? `${list.length} 条` : list[0].docTitle);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      void openTab({
        app: plugin.app,
        doc: { id: list[0].docId, action: ["cb-get-focus"], zoomIn: false },
      });
    });

    box.appendChild(row);
  }
  root.appendChild(box);
}

function renderRead(state: PanelState, root: HTMLElement, plugin: Plugin): void {
  const box = el("div", "tl-read");

  const sorted = [...state.entries].sort((a, b) => a.date.getTime() - b.date.getTime()); // 旧 → 新
  if (!sorted.length) {
    box.appendChild(el("div", "tl-empty", "没有可读的条目。"));
  }

  for (const e of sorted) {
    const block = el("div", "tl-entry");
    block.appendChild(el("div", "tl-entry-date", formatDisplay(e.date)));
    block.appendChild(el("div", "tl-entry-src", e.wholeDoc ? "整篇" : e.docTitle));

    block.addEventListener("click", () => {
      void openTab({
        app: plugin.app,
        doc: { id: e.docId, action: ["cb-get-focus"], zoomIn: false },
      });
    });

    box.appendChild(block);
  }
  root.appendChild(box);
}

async function mountPanel(container: HTMLElement, plugin: Plugin): Promise<void> {
  container.classList.add("tl-panel");
  container.innerHTML = "";

  const state: PanelState = { entries: [], tab: "axis" };

  const header = el("div", "tl-header");
  const tabAxis = el("button", "tl-tab tl-tab--on", "时间轴");
  const tabRead = el("button", "tl-tab", "连续阅读");
  const refresh = el("button", "tl-refresh", "刷新");
  header.append(tabAxis, tabRead, refresh);

  const body = el("div", "tl-body");
  const status = el("div", "tl-status", "加载中…");

  container.append(header, body, status);

  const paint = () => {
    body.innerHTML = "";
    tabAxis.classList.toggle("tl-tab--on", state.tab === "axis");
    tabRead.classList.toggle("tl-tab--on", state.tab === "read");
    if (state.tab === "axis") renderAxis(state, body, plugin);
    else renderRead(state, body, plugin);
  };

  const load = async () => {
    status.textContent = "加载中…";
    try {
      const notebook = await resolveNotebook(plugin);
      if (!notebook) {
        state.entries = [];
        status.textContent = "还没设置日记笔记本（去插件的日记模块里点一下「今天」）";
      } else {
        state.entries = await loadEntries(notebook);
        const days = groupByDay(state.entries).size;
        status.textContent = `共 ${state.entries.length} 条 / ${days} 天`;
      }
    } catch (err) {
      status.textContent = "加载失败：" + (err as Error)?.message;
    }
    paint();
  };

  tabAxis.addEventListener("click", () => { state.tab = "axis"; paint(); });
  tabRead.addEventListener("click", () => { state.tab = "read"; paint(); });
  refresh.addEventListener("click", () => { void load(); });

  await load();
}

export const timelineModule: JournalModule = {
  id: "timeline",
  name: "时间轴",
  description: "按天浏览与连续阅读日记（只读）",
  setup(plugin: Plugin) {
    // 自定义图标必须自己注册，不能假设内置图标名可用
    plugin.addIcons(`
      <symbol id="iconJournalTimeline" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
      </symbol>
    `);

    plugin.addDock({
      config: {
        position: "RightBottom",
        size: { width: 360, height: 0 },
        icon: "iconJournalTimeline",
        title: "日记时间轴",
      },
      data: {},
      type: "journal-timeline",
      init(dock) {
        void mountPanel(dock.element, plugin);
      },
      destroy() {
        // 面板由 SiYuan 负责移除
      },
    });
  },
};
