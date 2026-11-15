/**
 * 心情打点：在当天文档末尾插入一条心情记录，并把结构化数据写进块属性。
 *
 * 数据不存插件私有文件，而是块属性：
 *   custom-mood-score  分数 0-100
 *   custom-mood-emoji  表情
 *   custom-mood-at     ISO 时间
 *   custom-mood-note   备注（可选）
 *
 * 这样即使卸载插件，数据仍可用思源 SQL 查询块统计。
 */
import { appendBlock, setBlockAttrs, pushMsg, pushErrMsg } from "./api";

export interface MoodEntry {
  score: number;
  emoji: string;
  note?: string;
  at: Date;
}

/** 分数 -> 表情 */
export function emojiForScore(score: number): string {
  if (score >= 85) return "😄";
  if (score >= 65) return "🙂";
  if (score >= 45) return "😐";
  if (score >= 25) return "😕";
  return "😫";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 取当前激活编辑器的文档 ID。
 * 隐藏的页签 offsetParent 为 null，因此取最后一个可见的 .protyle-title。
 */
export function getActiveDocId(): string | null {
  const titles = Array.from(
    document.querySelectorAll<HTMLElement>(".protyle-title"),
  ).filter(el => el.getClientRects().length > 0);

  const el = titles[titles.length - 1];
  return el?.getAttribute("data-node-id") ?? null;
}

/** 插入一条心情记录，返回新建块的 ID */
export async function insertMood(docId: string, m: MoodEntry): Promise<string | null> {
  const line = `😊 心情 ${m.score} ${m.emoji} · ${formatStamp(m.at)}`
    + (m.note ? ` · ${m.note}` : "");

  const res = await appendBlock("markdown", line, docId);
  const blockId: string | undefined = (res as any)?.[0]?.doOperations?.[0]?.id;

  if (blockId) {
    const attrs: Record<string, string> = {
      "custom-mood-score": String(m.score),
      "custom-mood-emoji": m.emoji,
      "custom-mood-at": m.at.toISOString(),
    };
    if (m.note) attrs["custom-mood-note"] = m.note;

    try {
      await setBlockAttrs(blockId, attrs);
    } catch (err) {
      // 属性失败不影响正文，但要告诉用户
      pushErrMsg("心情已写入，但属性保存失败：" + (err as Error)?.message);
    }
  }

  return blockId ?? null;
}

/** 弹出打分面板 */
export function openMoodDialog(): void {
  const docId = getActiveDocId();
  if (!docId) {
    pushErrMsg("没有打开的文档，先打开一篇日记吧");
    return;
  }

  let score = 70;

  const overlay = document.createElement("div");
  overlay.className = "mood-overlay";
  overlay.innerHTML = `
    <div class="mood-dialog" role="dialog" aria-modal="true">
      <div class="mood-header">今天心情怎么样？</div>
      <div class="mood-emoji" data-role="emoji">🙂</div>
      <input class="mood-range" type="range" min="0" max="100" step="1" value="70" />
      <div class="mood-score"><span data-role="score">70</span> 分</div>
      <input class="mood-note" type="text" placeholder="一句话（可选），回车即记录" />
      <div class="mood-actions">
        <button class="mood-btn mood-cancel" type="button">取消</button>
        <button class="mood-btn mood-ok" type="button">记录</button>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector(sel) as T;
  const emojiEl = $('[data-role="emoji"]');
  const scoreEl = $('[data-role="score"]');
  const rangeEl = $(".mood-range") as HTMLInputElement;
  const noteEl = $(".mood-note") as HTMLInputElement;

  const sync = () => {
    emojiEl.textContent = emojiForScore(score);
    scoreEl.textContent = String(score);
  };

  const close = () => overlay.remove();

  const submit = async () => {
    const note = noteEl.value.trim();
    close();
    try {
      await insertMood(docId, {
        score,
        emoji: emojiForScore(score),
        note: note || undefined,
        at: new Date(),
      });
      pushMsg(`已记录心情 ${score} ${emojiForScore(score)}`);
    } catch (err) {
      pushErrMsg("记录失败：" + (err as Error)?.message);
    }
  };

  rangeEl.addEventListener("input", () => {
    score = Number(rangeEl.value);
    sync();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector(".mood-cancel")!.addEventListener("click", close);
  overlay.querySelector(".mood-ok")!.addEventListener("click", submit);
  noteEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  });

  document.body.appendChild(overlay);
  sync();
  rangeEl.focus();
}
