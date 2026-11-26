import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { teamToken } from "./api";
import { datesBetween, iso, monthGrid, weekdayNames } from "./calendar";
import * as team from "./teamApi";

const hhmm = (time: string) => time.slice(0, 5);
const hours = (x: team.TeamSlot) => (Date.parse(`2000-01-01T${hhmm(x.end_time)}`) - Date.parse(`2000-01-01T${hhmm(x.start_time)}`)) / 36e5;
const FULL_DAY_HOURS = 6; // as the team matcher counts a full day

/**
 * When does this guide fit one segment of the trip: a read-only month calendar of the guide's free days,
 * with the trip's days outlined. A trip day is "free" when a free stretch covers what the segment needs
 * (6+ hours for a stay, the session's hours for a short session), the same rule the matcher uses.
 */
export default function GuideCalendar({ guide, seg }: { guide: team.TeamGuideSummary; seg: team.TeamSegment }) {
  const { t, i18n } = useTranslation();
  const [slots, setSlots] = useState<team.TeamSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const tripDays = datesBetween(seg.start_date, seg.end_date);
  const first = new Date(`${seg.start_date}T00:00`), last = new Date(`${seg.end_date}T00:00`);
  const months: { y: number; m: number }[] = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= last; d.setMonth(d.getMonth() + 1)) months.push({ y: d.getFullYear(), m: d.getMonth() });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // the whole months around the trip, so the guide's free days just before and after show too (API limit: 90 days)
    const from = iso(new Date(first.getFullYear(), first.getMonth(), 1));
    const monthEnd = iso(new Date(last.getFullYear(), last.getMonth() + 1, 0));
    const wide = (Date.parse(monthEnd) - Date.parse(from)) / 864e5 <= 90;
    let live = true;
    team.guideAvailability(teamToken()!, guide.id, wide ? from : seg.start_date, wide ? monthEnd : seg.end_date)
      .then((s) => live && setSlots(s))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [guide.id, seg.start_date, seg.end_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="error">{t("teamtrip.calFailed")}</p>;
  if (!slots) return <p className="muted" role="status">{t("teamtrip.calLoading")}</p>;

  const fits = (x: team.TeamSlot) => (seg.service_type === "MICRO" && seg.start_time && seg.end_time
    ? hhmm(x.start_time) <= hhmm(seg.start_time) && hhmm(x.end_time) >= hhmm(seg.end_time)
    : hours(x) >= FULL_DAY_HOURS);
  const stateOf = (d: string): "free" | "short" | "off" => {
    const day = slots.filter((x) => x.date === d);
    return day.some(fits) ? "free" : day.length ? "short" : "off";
  };
  const missing = tripDays.filter((d) => stateOf(d) !== "free");
  const longDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const shortDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const { y, m } = months[shown];
  const monthName = new Date(y, m, 1).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });

  return (
    <div className="guidecal">
      <div className="calhead">
        <button type="button" className="icon-btn" disabled={shown === 0} onClick={() => setShown(shown - 1)} aria-label={t("cal.prev")}>‹</button>
        <h4 aria-live="polite">{monthName}</h4>
        <button type="button" className="icon-btn" disabled={shown === months.length - 1} onClick={() => setShown(shown + 1)} aria-label={t("cal.next")}>›</button>
      </div>
      <div className="calgrid" role="group" aria-label={t("teamtrip.calTitle", { name: guide.full_name, month: monthName })}>
        {weekdayNames(i18n.language).map((w, i) => <span key={i} className="calwd" aria-hidden="true">{w}</span>)}
        {monthGrid(y, m).map((d, i) => {
          if (!d) return <span key={i} />;
          const s = stateOf(d);
          const onTrip = d >= seg.start_date && d <= seg.end_date;
          const slot = slots.find((x) => x.date === d);
          return (
            <span
              key={d} className={`calday ${s}${onTrip ? " trip" : " outside"}`} role="img"
              aria-label={`${longDay(d)}: ${t(s === "free" ? "cal.free" : s === "short" ? "cal.short" : "cal.off")}${onTrip ? ` · ${t("teamtrip.calTrip")}` : ""}`}
            >
              <b>{Number(d.slice(8))}</b>
              {slot && <small>{hhmm(slot.start_time).replace(":00", "")}–{hhmm(slot.end_time).replace(":00", "")}</small>}
            </span>
          );
        })}
      </div>
      <ul className="callegend">
        <li><i className="dot free" />{t("cal.free")}</li>
        <li><i className="dot short" />{t("cal.short")}</li>
        <li><i className="dot off" />{t("cal.off")}</li>
        <li><i className="dot trip" />{t("teamtrip.calTrip")}</li>
      </ul>
      <p className={missing.length ? "warn" : "muted"}>
        {missing.length ? t("teamtrip.notFreeOn", { days: missing.map(shortDay).join(", ") }) : t("teamtrip.bookedElsewhere")}
      </p>
    </div>
  );
}
