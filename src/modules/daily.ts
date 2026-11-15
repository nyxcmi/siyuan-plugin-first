/**
 * 模块：日记核心
 *
 * 职责只有一件：拿到某一天的日记文档，没有就创建。
 * 其他模块（心情、闪念、天气）都调它拿 docId，再往里写内容。
 *
 * 关键决定：
 * - 创建走 /api/filetree/createDailyNote，尊重笔记本自己的「日记保存路径」和「日记模板」配置，
 *   这样插件建的日记和你手点的日记落在同一个位置、套同一个模板。
 * - 标题按格式（默认 `2026-11-15 周日`）生成，不符合就改名；也支持随时手改。
 * - 本模块不写正文内容，只负责定位 / 创建 / 改名。
 */
import { fetchSyncPost, openTab } from "siyuan";
import type { Plugin } from "siyuan";
import {
  appendBlock,
  getHPathByID,
  getNotebookConf,
  lsNotebooks,
  pushErrMsg,
  pushMsg,
  sql,
} from "../api";
import type { JournalModule } from "./types";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const CONF_KEY = "daily-config";
const pad = (n: number) => String(n).padStart(2, "0");

export const DEFAULT_TITLE_FORMAT = "{yyyy}-{mm}-{dd} {weekday}";

/** 笔记本没配模板时用的兜底模板 */
const FALLBACK_TEMPLATE = `#### Today

#### 闪念

#### 明天
`;

interface DailyConfig {
  notebook: string;
  format: string;
}

/** 按格式生成标题，如 2026-11-15 周日 */
export function formatDailyTitle(d: Date, fmt: string = DEFAULT_TITLE_FORMAT): string {
  return fmt
    .replace(/\{yyyy\}/g, String(d.getFullYear()))
    .replace(/\{mm\}/g, pad(d.getMonth() + 1))
    .replace(/\{dd\}/g, pad(d.getDate()))
    .replace(/\{weekday\}/g, WEEKDAYS[d.getDay()])
    .replace(/\{iso\}/g, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

async function post(path: string, data: unknown): Promise<any> {
  const res: any = await fetchSyncPost(path, data);
  return res && res.code === 0 ? res.data : null;
}

async function loadConfig(plugin: Plugin): Promise<DailyConfig> {
  const saved = await plugin.loadData(CONF_KEY).catch(() => null);
  return {
    notebook: saved?.notebook ?? "",
    format: saved?.format ?? DEFAULT_TITLE_FORMAT,
  };
}

async function saveConfig(plugin: Plugin, cfg: DailyConfig): Promise<void> {
  await plugin.saveData(CONF_KEY, cfg);
}

/** 在指定笔记本里按标题前缀找当天的日记 */
async function findDailyNote(notebook: string, date: Date): Promise<string | null> {
  const iso = formatDailyTitle(date, "{iso}");
  const rows: any[] = await sql(
    `select id from blocks where type = 'd' and box = '${notebook}' and content like '${iso}%' limit 1`,
  );
  return rows?.[0]?.id ?? null;
}

function dialog(html: string): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "daily-overlay";
  overlay.innerHTML = `<div class="daily-dialog" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  return overlay;
}

/** 第一次使用时让用户选日记笔记本 */
async function pickNotebook(): Promise<string | null> {
  const res: any = await lsNotebooks();
  const list: any[] = res?.notebooks ?? [];
  if (!list.length) {
    pushErrMsg("这个工作区里没有笔记本");
    return null;
  }

  return new Promise((resolve) => {
    const overlay = dialog(`
      <div class="daily-title">选择「日记」笔记本</div>
      <div class="daily-hint">只问一次，之后记住这个选择</div>
      <div class="daily-list">
        ${list.map(n => `<button class="daily-item" data-id="${n.id}">${n.name}</button>`).join("")}
      </div>
      <div class="daily-actions">
        <button class="daily-btn daily-cancel" type="button">取消</button>
      </div>`);

    overlay.querySelectorAll(".daily-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.id!;
        overlay.remove();
        resolve(id);
      });
    });
    overlay.querySelector(".daily-cancel")!.addEventListener("click", () => {
      overlay.remove();
      resolve(null);
    });
  });
}

/** 弹一个输入框，返回新标题（取消返回 null） */
function promptTitle(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = dialog(`
      <div class="daily-title">修改日记标题</div>
      <input class="daily-input" type="text" value="${current.replace(/"/g, "&quot;")}" />
      <div class="daily-actions">
        <button class="daily-btn daily-cancel" type="button">取消</button>
        <button class="daily-btn daily-ok" type="button">确定</button>
      </div>`);

    const input = overlay.querySelector(".daily-input") as HTMLInputElement;
    const done = (v: string | null) => {
      overlay.remove();
      resolve(v);
    };
    overlay.querySelector(".daily-cancel")!.addEventListener("click", () => done(null));
    overlay.querySelector(".daily-ok")!.addEventListener("click", () => done(input.value.trim() || null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(input.value.trim() || null);
      if (e.key === "Escape") done(null);
    });
    input.focus();
    input.select();
  });
}

/**
 * 保证某天的日记存在，返回文档 ID。
 * 找不到就调官方接口创建；笔记本没配模板时补一份兜底模板。
 */
export async function ensureDailyNote(plugin: Plugin, date: Date = new Date()): Promise<string | null> {
  const cfg = await loadConfig(plugin);

  if (!cfg.notebook) {
    const picked = await pickNotebook();
    if (!picked) return null;
    cfg.notebook = picked;
    await saveConfig(plugin, cfg);
  }

  const existing = await findDailyNote(cfg.notebook, date);
  if (existing) return existing;

  const created = await post("/api/filetree/createDailyNote", {
    notebook: cfg.notebook,
    app: plugin.app.appId,
  });
  const id: string | null = typeof created === "string" ? created : (created?.id ?? null);
  if (!id) {
    pushErrMsg("创建日记失败，检查笔记本设置");
    return null;
  }

  // 笔记本没配日记模板时，补一份
  try {
    const conf: any = await getNotebookConf(cfg.notebook);
    if (!conf?.conf?.dailyNoteTemplatePath) {
      await appendBlock("markdown", FALLBACK_TEMPLATE, id);
    }
  } catch (err) {
    console.warn("[daily] 检查模板配置失败，跳过兜底模板", err);
  }

  // 标题不符合格式就改名
  const want = formatDailyTitle(date, cfg.format);
  try {
    const hpath: string = await getHPathByID(id);
    const current = hpath.split("/").filter(Boolean).pop() ?? "";
    if (current && current !== want) {
      await post("/api/filetree/renameDocByID", { id, title: want });
    }
  } catch (err) {
    console.warn("[daily] 改标题失败", err);
  }

  // 打上日期属性，方便日后精确查询
  await post("/api/attr/setBlockAttrs", {
    id,
    attrs: { "custom-daily-date": formatDailyTitle(date, "{iso}") },
  });

  return id;
}

/** 打开某天的日记（没有就建） */
export async function openDailyNote(plugin: Plugin, date: Date = new Date()): Promise<void> {
  const id = await ensureDailyNote(plugin, date);
  if (!id) return;
  await openTab({
    app: plugin.app,
    doc: { id, action: ["cb-get-focus"], zoomIn: false },
  });
}

/** 手动改今天日记的标题 */
async function renameTodayNote(plugin: Plugin): Promise<void> {
  const id = await ensureDailyNote(plugin);
  if (!id) return;

  const hpath: string = await getHPathByID(id);
  const current = hpath.split("/").filter(Boolean).pop() ?? "";

  const next = await promptTitle(current);
  if (!next || next === current) return;

  const ok = await post("/api/filetree/renameDocByID", { id, title: next });
  if (ok) {
    pushMsg(`标题已改为「${next}」`);
  } else {
    pushErrMsg("改名失败");
  }
}

export const dailyModule: JournalModule = {
  id: "daily",
  name: "日记核心",
  description: "定位 / 创建当天日记，套用笔记本模板，支持改标题",
  setup(plugin: Plugin) {
    const bar = plugin.addTopBar({
      icon: "iconCalendar",
      title: "今天",
      position: "right",
      callback: () => { void openDailyNote(plugin); },
    });

    plugin.addCommand({
      langKey: "openToday",
      langText: "打开今日日记",
      hotkey: "",
      callback: () => { void openDailyNote(plugin); },
    });

    plugin.addCommand({
      langKey: "openYesterday",
      langText: "打开昨日日记",
      hotkey: "",
      callback: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        void openDailyNote(plugin, d);
      },
    });

    plugin.addCommand({
      langKey: "renameToday",
      langText: "改日记标题",
      hotkey: "",
      callback: () => { void renameTodayNote(plugin); },
    });

    return () => { bar?.remove(); };
  },
};
