import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, listBookings, teamToken } from "../api";
import * as team from "../teamApi";

const hhmm = (time: string) => time.slice(0, 5);
const iso = (d: Date) => d.toLocaleDateString("sv"); // local YYYY-MM-DD
const today = () => iso(new Date());
const FULL_DAY_HOURS = 6; // the team matcher counts a free stretch this long as a full day

/** Every date from `from` to `to`, inclusive. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00`); d <= new Date(`${to}T00:00`); d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}
const hours = (s: team.TeamSlot) =>
  (Date.parse(`2000-01-01T${hhmm(s.end_time)}`) - Date.parse(`2000-01-01T${hhmm(s.start_time)}`)) / 36e5;

/** The 6×7 grid of dates shown for a month, starting on Sunday; days outside the month are null. */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

type DayState = "free" | "short" | "booked" | "off" | "past";

/**
 * When a guide can be booked, as a month calendar. Tap days to select them, then mark them free (with hours)
 * or not free; nothing is sent until "Save". Booked days come from the guide's accepted bookings.
 * Kept in the team API; its matcher only offers a guide for days they are free.
 */
export default function AvailabilityPage() {
  const { t, i18n } = useTranslation();
  const tok = teamToken();
  const [saved, setSaved] = useState<team.TeamSlot[] | null>(null);
  const [slots, setSlots] = useState<team.TeamSlot[]>([]);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "noProfile" | "failed">("loading");
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [times, setTimes] = useState({ start: "09:00", end: "18:00" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tok) return;
    let live = true;
    team.getAvailability(tok)
      .then((s) => { if (live) { setSaved(s); setSlots(s); setState("ready"); } })
      .catch((e) => live && setState(e instanceof ApiError && e.status === 404 ? "noProfile" : "failed"));
    // booked days are only shown, so a failure here just leaves them out
    listBookings()
      .then((bs) => {
        if (!live) return;
        const days = new Set<string>();
        bs.filter((b) => b.status === "accepted" && b.trip.start_date)
          .forEach((b) => datesBetween(b.trip.start_date, b.trip.end_date || b.trip.start_date).forEach((d) => days.add(d)));
        setBooked(days);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [tok]);

  const byDay = useMemo(() => {
    const m = new Map<string, team.TeamSlot[]>();
    for (const s of slots) m.set(s.date, [...(m.get(s.date) ?? []), s].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return m;
  }, [slots]);

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

  const now = today();
  const changed = JSON.stringify([...slots].sort(cmp)) !== JSON.stringify([...(saved ?? [])].sort(cmp));
  const dayState = (d: string): DayState => {
    if (d < now) return "past";
    if (booked.has(d)) return "booked";
    const s = byDay.get(d);
    if (!s) return "off";
    return Math.max(...s.map(hours)) >= FULL_DAY_HOURS ? "free" : "short";
  };
  const cells = monthGrid(month.y, month.m);
  const inMonth = cells.filter((c): c is string => !!c);
  const monthName = new Date(month.y, month.m, 1).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
  const weekdays = [...Array(7)].map((_, i) => new Date(2024, 8, 1 + i).toLocaleDateString(i18n.language, { weekday: "narrow" })); // 1 Sep 2024 was a Sunday
  const longDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const isThisMonth = month.y === new Date().getFullYear() && month.m === new Date().getMonth();
  const counts = { free: 0, short: 0, booked: 0 };
  inMonth.forEach((d) => { const s = dayState(d); if (s === "free" || s === "short" || s === "booked") counts[s]++; });

  const shift = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const toggle = (d: string) => {
    setMsg(null);
    setPicked((p) => { const next = new Set(p); if (next.has(d)) next.delete(d); else next.add(d); return next; });
  };
  const selectRest = () => setPicked(new Set(inMonth.filter((d) => d >= now)));
  const markFree = () => {
    if (times.end <= times.start) return setMsg({ ok: false, text: t("avail.err.times") });
    setSlots([...slots.filter((s) => !picked.has(s.date)), ...[...picked].map((date) => ({ date, start_time: times.start, end_time: times.end }))]);
    setPicked(new Set());
  };
  const markOff = () => { setSlots(slots.filter((s) => !picked.has(s.date))); setPicked(new Set()); };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const next = await team.saveAvailability(tok, [...slots].sort(cmp).map((s) => ({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })));
      setSaved(next);
      setSlots(next);
      setMsg({ ok: true, text: t("avail.saved") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.detail ? e.detail : t("avail.saveFailed") });
    } finally {
      setBusy(false);
    }
  };

  const one = picked.size === 1 ? [...picked][0] : null;
  return (
    <div className="page formpage availpage">
      <h1>{t("avail.title")}</h1>
      <p className="muted">{t("cal.intro", { hours: FULL_DAY_HOURS })}</p>

      <section className="calcard" aria-label={monthName}>
        <header className="calhead">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={isThisMonth} aria-label={t("cal.prev")}>‹</button>
          <h2 aria-live="polite">{monthName}</h2>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t("cal.next")}>›</button>
        </header>
        <p className="calsum">
          <span><i className="dot free" />{t("cal.countFree", { count: counts.free + counts.short })}</span>
          <span><i className="dot booked" />{t("cal.countBooked", { count: counts.booked })}</span>
        </p>
        <div className="calgrid">
          {weekdays.map((w, i) => <span key={i} className="calwd" aria-hidden="true">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const s = dayState(d);
            const slot = byDay.get(d)?.[0];
            return (
              <button
                key={d} type="button" disabled={s === "past"}
                className={`calday ${s}${picked.has(d) ? " picked" : ""}${d === now ? " today" : ""}`}
                aria-pressed={picked.has(d)}
                aria-label={`${longDay(d)}: ${t(`cal.${s}`)}${slot ? ` ${hhmm(slot.start_time)}–${hhmm(slot.end_time)}` : ""}`}
                onClick={() => toggle(d)}
              >
                <b>{Number(d.slice(8))}</b>
                {slot && s !== "past" && <small>{hhmm(slot.start_time).replace(":00", "")}–{hhmm(slot.end_time).replace(":00", "")}</small>}
              </button>
            );
          })}
        </div>
        <ul className="callegend">
          {(["free", "short", "booked", "off"] as const).map((k) => <li key={k}><i className={`dot ${k}`} />{t(`cal.${k}`)}</li>)}
        </ul>
      </section>

      {picked.size === 0 ? (
        <div className="calhint">
          <p className="muted">{t("cal.tapHint")}</p>
          <button type="button" className="textlink" onClick={selectRest}>{t("cal.selectRest")}</button>
        </div>
      ) : (
        <section className="calpanel" aria-label={t("cal.selected", { count: picked.size })}>
          <header>
            <h2>{one ? longDay(one) : t("cal.selected", { count: picked.size })}</h2>
            <button type="button" className="textlink" onClick={() => setPicked(new Set())}>{t("cal.clear")}</button>
          </header>
          {one && (byDay.get(one)?.length ?? 0) > 0 && (
            <p className="muted">{t("cal.now")}: {byDay.get(one)!.map((s) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`).join(", ")}</p>
          )}
          <div className="row">
            <label>{t("avail.start")}<input type="time" step={1800} value={times.start} onChange={(e) => setTimes({ ...times, start: e.target.value })} /></label>
            <label>{t("avail.end")}<input type="time" step={1800} value={times.end} onChange={(e) => setTimes({ ...times, end: e.target.value })} /></label>
          </div>
          {[...picked].some((d) => booked.has(d)) && <p className="muted small-note">{t("cal.bookedNote")}</p>}
          <div className="rowbtns">
            <button type="button" className="primary" onClick={markFree}>{t("cal.markFree")}</button>
            <button type="button" className="ghost" onClick={markOff}>{t("cal.markOff")}</button>
          </div>
        </section>
      )}

      <div className={"calsave" + (changed ? " dirty" : "")}>
        <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : "muted"}>
          {msg?.text ?? (changed ? t("avail.unsaved") : slots.length === 0 ? t("avail.none") : "")}
        </p>
        {changed && (
          <div className="rowbtns">
            <button type="button" className="primary" disabled={busy} onClick={save}>{busy ? t("cal.saving") : t("avail.save")}</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => { setSlots(saved ?? []); setPicked(new Set()); setMsg(null); }}>{t("collab.cancel")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const cmp = (a: team.TeamSlot, b: team.TeamSlot) => (a.date + a.start_time).localeCompare(b.date + b.start_time);
