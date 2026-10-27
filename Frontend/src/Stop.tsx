import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { StopNav, type NavPrefs } from "./StopNav";
import TimeWheel from "./TimeWheel";
import { MODES } from "./mapLinks";
import { MAX_VISIT_MIN, overlapsNext, STATES, VISIT_PRESETS } from "./progress";
import type { ItineraryItem, Progress, StopFields, Transport } from "./types";

/** "45 min", "1 h", "1 h 30 min" */
export function useDuration() {
  const { t } = useTranslation();
  return (min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    return h === 0 ? t("dur.min", { m }) : m === 0 ? t("dur.h", { h }) : t("dur.hm", { h, m });
  };
}

export function StopForm({ initial, days, submitLabel, busy, onSubmit, onCancel }: {
  initial: StopFields;
  days: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (f: StopFields) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const dur = useDuration();
  const [f, setF] = useState<StopFields>({ duration_min: 0, transport: "", ...initial });
  const length = f.duration_min ?? 0;
  // "Other" opens a minutes box; it starts open when the saved length is not one of the presets
  const [custom, setCustom] = useState(length > 0 && !VISIT_PRESETS.includes(length));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...f, place_name: f.place_name.trim() });
  };
  return (
    <form className="stopform" onSubmit={submit}>
      <div className="row">
        <label>{t("collab.dayField")}
          <select value={f.day_number} onChange={(e) => setF({ ...f, day_number: +e.target.value })}>
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{t("itinerary.day", { n: d })}</option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>{t("collab.time")}</span>
          <TimeWheel value={f.start_time} label={t("collab.time")} onChange={(v) => setF((prev) => ({ ...prev, start_time: v }))} />
        </div>
      </div>
      <div className="row">
        <label>{t("sched.length")}
          <select
            value={custom ? "custom" : length}
            onChange={(e) => {
              const isCustom = e.target.value === "custom";
              setCustom(isCustom);
              setF({ ...f, duration_min: isCustom ? (length || 45) : +e.target.value });
            }}
          >
            <option value={0}>{t("sched.notSet")}</option>
            {VISIT_PRESETS.map((m) => <option key={m} value={m}>{dur(m)}</option>)}
            <option value="custom">{t("sched.custom")}</option>
          </select>
        </label>
        <label>{t("sched.transport")}
          <select value={f.transport ?? ""} onChange={(e) => setF({ ...f, transport: e.target.value as Transport })}>
            <option value="">{t("sched.tripDefault")}</option>
            {MODES.map((m) => <option key={m} value={m}>{t(`go.modes.${m}`)}</option>)}
          </select>
        </label>
      </div>
      {custom && (
        <label>{t("sched.minutes")}
          <input
            type="number" required min={5} max={MAX_VISIT_MIN} step={5} value={length || ""}
            onChange={(e) => setF({ ...f, duration_min: Math.round(+e.target.value) })}
          />
          <small className="muted">{t("sched.minutesHint", { max: MAX_VISIT_MIN })}</small>
        </label>
      )}
      <label>{t("collab.place")}
        <input type="text" required value={f.place_name} onChange={(e) => setF({ ...f, place_name: e.target.value })} />
      </label>
      <label>{t("collab.activity")}
        <textarea value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} />
      </label>
      <div className="rowbtns">
        <button type="submit" className="primary" disabled={busy || !f.place_name.trim()}>{submitLabel}</button>
        <button type="button" className="ghost" onClick={onCancel}>{t("collab.cancel")}</button>
      </div>
    </form>
  );
}

const PROGRESS_MARK: Record<Progress, string> = { upcoming: "○", on_the_way: "→", visited: "✓", skipped: "×" };

export function Stop({ item, prev, next, nav, near, days, editable, isGuide, canComment, busy, onSave, onDelete, onCheck, onComment, onProgress }: {
  item: ItineraryItem;
  prev?: ItineraryItem; // the stop before this one on the same day, for "directions from the previous stop"
  next?: ItineraryItem; // the stop after this one on the same day, to notice an overlap
  nav: NavPrefs;
  near: string; // the trip's city, to narrow a search by name
  days: number;
  editable: boolean;
  isGuide: boolean;
  canComment: boolean;
  busy: boolean;
  // each resolves to true when the server accepted the change
  onSave: (f: StopFields, version: number) => Promise<boolean>;
  onDelete: () => void;
  onCheck: () => void;
  onComment: (body: string) => Promise<boolean>;
  onProgress: (next: Progress) => void;
}) {
  const { t } = useTranslation();
  // holds the version that was on screen when editing began, so a change made meanwhile is caught as a conflict
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const dur = useDuration();
  const late = overlapsNext(item, next);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && (await onComment(text.trim()))) setText("");
  };

  return (
    <li className={`p-${item.progress}`}>
      <div className="when">
        <time>{item.start_time}</time>
        {item.duration_min > 0 && <small>{dur(item.duration_min)}</small>}
      </div>
      <div>
        {/* Closed, a stop is just its name and description. Opening it shows progress, map links, editing and comments. */}
        <button type="button" className="stophead" aria-expanded={open} onClick={() => setOpen(!open)}>
          <strong className="place">{item.place_name}</strong>
          {item.activity && <span className="what">{item.activity}</span>}
          {late && <span className="warn">{t("sched.overlap", { time: next!.start_time })}</span>}
          {(item.progress !== "upcoming" || item.comments.length > 0) && (
            <span className="badges">
              {item.progress !== "upcoming" && (
                <span className="prog"><span aria-hidden="true">{PROGRESS_MARK[item.progress]}</span> {t(`progress.state.${item.progress}`)}</span>
              )}
              {item.comments.length > 0 && <span>{t("collab.commentCount", { count: item.comments.length })}</span>}
            </span>
          )}
        </button>
        {open && (<>
        <div className="badges">
          {/* the mark and the words carry the state; colour only repeats it */}
          <span className="prog"><span aria-hidden="true">{PROGRESS_MARK[item.progress]}</span> {t(`progress.state.${item.progress}`)}</span>
          {item.meal && <span className="meal">{t(`meal.${item.meal}`)}</span>}
          {item.transport && <span>{t(`go.modes.${item.transport}`)}</span>}
          <span>
            {item.status === "ai_draft" || !item.last_edited_by
              ? t("collab.aiDraft")
              : t("collab.editedBy", { who: t(`collab.role.${item.last_edited_by}`) })}
          </span>
          {item.needs_accessibility_check && <span className="flag">{t("itinerary.check")}</span>}
          {item.lat === null && <span>{t("map.unplaced")}</span>}
        </div>

        {editing === null && canComment && (
          <label className="statuspick">{t("progress.status")}
            <select value={item.progress} disabled={busy} onChange={(e) => onProgress(e.target.value as Progress)}>
              {STATES.map((p) => <option key={p} value={p}>{PROGRESS_MARK[p]} {t(`progress.state.${p}`)}</option>)}
            </select>
          </label>
        )}

        {editing === null && (
          <StopNav
            place={{ name: item.place_name, lat: item.lat, lng: item.lng }} near={near}
            prefs={item.transport ? { ...nav, mode: item.transport } : nav}
            prev={prev && { name: prev.place_name, lat: prev.lat, lng: prev.lng }}
          />
        )}

        {editing !== null ? (
          <StopForm
            initial={item} days={days} submitLabel={t("collab.save")} busy={busy}
            onSubmit={async (f) => (await onSave(f, editing)) && setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        ) : editable && (
          <div className="rowbtns">
            <button type="button" className="ghost small" onClick={() => setEditing(item.version)} aria-label={`${t("collab.edit")}: ${item.place_name}`}>{t("collab.edit")}</button>
            <button type="button" className="ghost small" disabled={busy} onClick={onDelete} aria-label={`${t("collab.remove")}: ${item.place_name}`}>{t("collab.remove")}</button>
            {isGuide && item.needs_accessibility_check && (
              <button type="button" className="primary small" disabled={busy} onClick={onCheck} aria-label={`${t("collab.markChecked")}: ${item.place_name}`}>{t("collab.markChecked")}</button>
            )}
          </div>
        )}

        {item.comments.length > 0 && (
          <ul className="comments" aria-label={t("collab.comments")}>
            {item.comments.map((c) => (
              <li key={c.created_at + c.body} className={c.author}>
                <strong>{t(`collab.role.${c.author}`)}:</strong> {c.body}
              </li>
            ))}
          </ul>
        )}
        {canComment && <form className="commentform" onSubmit={send}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)}
            aria-label={t("collab.comment", { place: item.place_name })} placeholder={t("collab.comment", { place: item.place_name })} />
          <button type="submit" className="ghost small" disabled={busy || !text.trim()}>{t("collab.send")}</button>
        </form>}
        </>)}
      </div>
    </li>
  );
}
