import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, teamToken } from "../api";
import * as team from "../teamApi";

const hhmm = (time: string) => time.slice(0, 5);
const today = () => new Date().toLocaleDateString("sv"); // local YYYY-MM-DD
const FULL_DAY_HOURS = 6; // the team matcher counts a free stretch this long as a full day

/** Every date from `from` to `to`, inclusive. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00`); d <= new Date(`${to}T00:00`); d.setDate(d.getDate() + 1)) out.push(d.toLocaleDateString("sv"));
  return out;
}
const overlaps = (a: team.TeamSlot, b: team.TeamSlot) =>
  a.date === b.date && hhmm(a.start_time) < hhmm(b.end_time) && hhmm(b.start_time) < hhmm(a.end_time);

/**
 * When a guide can be booked. Kept in the team API; its matcher only offers a guide for days they are free,
 * so a guide with no availability is never matched.
 */
export default function AvailabilityPage() {
  const { t, i18n } = useTranslation();
  const tok = teamToken();
  const [saved, setSaved] = useState<team.TeamSlot[] | null>(null);
  const [slots, setSlots] = useState<team.TeamSlot[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "noProfile" | "failed">("loading");
  const [form, setForm] = useState({ from: "", to: "", start: "09:00", end: "18:00" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tok) return;
    let live = true;
    team.getAvailability(tok)
      .then((s) => { if (live) { setSaved(s); setSlots(s); setState("ready"); } })
      .catch((e) => live && setState(e instanceof ApiError && e.status === 404 ? "noProfile" : "failed"));
    return () => { live = false; };
  }, [tok]);

  if (!tok) return <div className="page formpage"><h1>{t("avail.title")}</h1><p className="notice">{t("avail.sample")}</p></div>;
  if (state === "loading") return <div className="page formpage"><h1>{t("avail.title")}</h1><p role="status">{t("avail.loading")}</p></div>;
  if (state !== "ready") {
    return (
      <div className="page formpage">
        <h1>{t("avail.title")}</h1>
        {state === "noProfile"
          ? <p className="notice check">{t("avail.noProfile")} <Link to="/profile">{t("nav.profile")}</Link></p>
          : <p role="alert" className="error">{t("avail.failed")}</p>}
      </div>
    );
  }

  const changed = JSON.stringify(slots) !== JSON.stringify(saved);
  const sorted = [...slots].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const hours = (s: team.TeamSlot) => (Date.parse(`2000-01-01T${hhmm(s.end_time)}`) - Date.parse(`2000-01-01T${hhmm(s.start_time)}`)) / 36e5;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const to = form.to || form.from;
    if (!form.from) return setMsg({ ok: false, text: t("avail.err.noDate") });
    if (form.from < today()) return setMsg({ ok: false, text: t("avail.err.past") });
    if (to < form.from) return setMsg({ ok: false, text: t("avail.err.range") });
    if (form.end <= form.start) return setMsg({ ok: false, text: t("avail.err.times") });
    const fresh = datesBetween(form.from, to).map((date) => ({ date, start_time: form.start, end_time: form.end }));
    if (fresh.length > 120) return setMsg({ ok: false, text: t("avail.err.tooMany") });
    const clash = fresh.find((n) => slots.some((s) => overlaps(s, n)));
    if (clash) return setMsg({ ok: false, text: t("avail.err.overlap", { date: day(clash.date) }) });
    setSlots([...slots, ...fresh]);
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const next = await team.saveAvailability(tok, sorted.map((s) => ({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })));
      setSaved(next);
      setSlots(next);
      setMsg({ ok: true, text: t("avail.saved") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.detail ? e.detail : t("avail.saveFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page formpage">
      <h1>{t("avail.title")}</h1>

      <form className="stopform" onSubmit={add}>
        <h2>{t("avail.add")}</h2>
        <div className="row">
          <label>{t("avail.from")}<input type="date" required min={today()} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
          <label>{t("avail.to")}<input type="date" min={form.from || today()} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
        </div>
        <div className="row">
          <label>{t("avail.start")}<input type="time" step={1800} required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label>{t("avail.end")}<input type="time" step={1800} required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
        </div>
        <small className="muted">{t("avail.hint", { hours: FULL_DAY_HOURS })}</small>
        <div className="rowbtns"><button type="submit" className="ghost">{t("avail.addBtn")}</button></div>
      </form>

      <h2>{t("avail.upcoming")}</h2>
      {sorted.length === 0 ? <p className="muted">{t("avail.none")}</p> : (
        <ul className="slots">
          {sorted.map((s) => (
            <li key={s.date + s.start_time}>
              <span>{day(s.date)}</span>
              <span>{hhmm(s.start_time)}–{hhmm(s.end_time)}{hours(s) < FULL_DAY_HOURS && <small className="muted"> · {t("avail.short")}</small>}</span>
              <button type="button" className="textlink" onClick={() => setSlots(slots.filter((x) => x !== s))}
                aria-label={t("avail.remove", { when: `${day(s.date)} ${hhmm(s.start_time)}` })}>{t("collab.remove")}</button>
            </li>
          ))}
        </ul>
      )}

      <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : "muted"}>
        {msg?.text ?? (changed ? t("avail.unsaved") : "")}
      </p>
      <div className="rowbtns">
        <button type="button" className="primary" disabled={!changed || busy} onClick={save}>{busy ? t("auth.waking") : t("avail.save")}</button>
        {changed && <button type="button" className="ghost" disabled={busy} onClick={() => { setSlots(saved ?? []); setMsg(null); }}>{t("collab.cancel")}</button>}
      </div>
    </div>
  );
}
