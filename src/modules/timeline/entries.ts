/**
 * 时间轴 · 数据层
 *
 * 只认唯一标准格式：YYYY-MM-DD（如 2026-11-18）
 * 标题里不写星期，星期由程序算。
 *
 * 数据来源有两种形态，都要支持：
 *   1. 单日文档：文档标题就是日期（未来"一天一篇"的写法）
 *   2. 合订本：文档内部的标题块里带日期（现在的历史数据）
 */
import { sql } from "../../api";

export interface DiaryEntry {
  /** 标题块 id；单日文档时等于文档 id */
  blockId: string;
  docId: string;
  /** 所属文档标题，如 "5-6月"、"2026-11-18" */
  docTitle: string;
  date: Date;
  /** 原标题原文 */
  rawTitle: string;
  /** 文档标题本身就是日期（整篇 = 一条） */
  wholeDoc: boolean;
}

const CANONICAL = /^(\d{4})-(\d{2})-(\d{2})/;
const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const pad = (n: number) => String(n).padStart(2, "0");

/** 解析标准格式；不符合返回 null（不猜测、不兼容旧格式） */
export function parseCanonical(text: string): Date | null {
  if (!text) return null;
  const m = text.trim().match(CANONICAL);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const date = new Date(y, mo - 1, d);
  // 防 2 月 30 日这种
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** 2026-11-18 */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2026-11-18 周三（界面显示用，星期是算出来的） */
export function formatDisplay(d: Date): string {
  return `${formatDate(d)} ${WEEK_CN[d.getDay()]}`;
}

/** 按天分组用的键 */
export function dayKey(d: Date): string {
  return formatDate(d);
}

interface RawDoc { id: string; content: string }
interface RawHeading { id: string; root_id: string; content: string }

/** 取指定笔记本下的所有条目 */
export async function loadEntries(notebook: string): Promise<DiaryEntry[]> {
  if (!notebook) return [];

  const [docs, headings] = await Promise.all([
    sql(`select id, content from blocks where type = 'd' and box = '${notebook}'`) as Promise<RawDoc[]>,
    sql(`select id, root_id, content from blocks where type = 'h' and box = '${notebook}'`) as Promise<RawHeading[]>,
  ]);

  const entries: DiaryEntry[] = [];
  const docTitleOf = new Map<string, string>();
  for (const d of docs ?? []) docTitleOf.set(d.id, d.content ?? "");

  // ① 文档标题就是日期 → 整篇算一条
  const wholeDocIds = new Set<string>();
  for (const d of docs ?? []) {
    const date = parseCanonical(d.content ?? "");
    if (!date) continue;
    wholeDocIds.add(d.id);
    entries.push({
      blockId: d.id,
      docId: d.id,
      docTitle: d.content ?? "",
      date,
      rawTitle: d.content ?? "",
      wholeDoc: true,
    });
  }

  // ② 文档内部的标题块带日期 → 每个标题算一条
  for (const h of headings ?? []) {
    // 文档标题已经是日期，说明整篇只算一条，跳过内部标题
    if (wholeDocIds.has(h.root_id)) continue;

    const date = parseCanonical(h.content ?? "");
    if (!date) continue;

    entries.push({
      blockId: h.id,
      docId: h.root_id,
      docTitle: docTitleOf.get(h.root_id) ?? "",
      date,
      rawTitle: h.content ?? "",
      wholeDoc: false,
    });
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  return entries;
}

/** 按天分组（时间轴 tab 用：一天一格） */
export function groupByDay(entries: DiaryEntry[]): Map<string, DiaryEntry[]> {
  const map = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    const key = dayKey(e.date);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return map;
}

/** 取一个日期区间的条目（连续阅读 tab 用） */
export function filterRange(entries: DiaryEntry[], from: Date, to: Date): DiaryEntry[] {
  const a = from.getTime();
  const b = to.getTime();
  return entries.filter(e => e.date.getTime() >= a && e.date.getTime() <= b);
}
