import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getItinerary, getPlan, listBookings, listItineraries, setTransfers } from "../api";
import ItineraryView from "../ItineraryView";
import { stayDays, TRANSFER_INFO, transferModes } from "../multiCity";
import { useLocalized } from "../names";
import { summarize } from "../progress";
import { useProfile } from "../ProfileContext";
import TripProgress from "../TripProgress";
import type { Booking, Itinerary, Transfer, TripLeg, TripPlan } from "../types";

const today = () => new Date().toLocaleDateString("sv"); // local YYYY-MM-DD
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/**
 * A multi-city trip. The plan is the outline (cities, dates, transfers); each city is matched, booked and planned
 * through the same flow as a one-city trip, so every stop belongs to exactly one city's itinerary.
 */
export default function PlanPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const nav = useNavigate();
  const { id } = useParams();
  const { setProfile } = useProfile();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [byCity, setByCity] = useState<Record<string, Itinerary>>({}); // region -> its itinerary, once a guide accepted
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setPlan(null);
    setFailed(false);
    (async () => {
      const planId = Number(id);
      const [p, summaries, allBookings] = await Promise.all([getPlan(planId), listItineraries(), listBookings()]);
      const mine = summaries.filter((s) => s.plan_id === planId);
      const full = await Promise.all(mine.map((s) => getItinerary(s.id)));
      if (!live) return;
      setPlan(p);
      setByCity(Object.fromEntries(full.map((it) => [it.trip.region, it])));
      setBookings(allBookings.filter((b) => b.trip.plan_id === planId));
    })().catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [id]);

  const onItinerary = useCallback((it: Itinerary) => setByCity((prev) => ({ ...prev, [it.trip.region]: it })), []);

  const back = <Link to="/trips" className="backlink">← {t("multi.back")}</Link>;
  if (failed) return <div className="page wide">{back}<p role="alert" className="error">{t("multi.notFound")}</p></div>;
  if (!plan) return <div className="page wide"><p role="status">{t("multi.loading")}</p></div>;

  const city = (leg: TripLeg) => t(`region.${leg.region}`);
  // the newest request for a city that is still open or was turned down; an accepted one shows as an itinerary
  const bookingFor = (leg: TripLeg) =>
    [...bookings].sort((a, b) => b.id - a.id).find((b) => b.trip.region === leg.region && (b.status === "pending" || b.status === "declined"));
  const allItems = plan.legs.flatMap((leg) => byCity[leg.region]?.items ?? []); // each stop once, in visiting order

  const findGuide = (leg: TripLeg) => {
    setProfile({ ...plan.prefs, religious: [], notes: "", ...leg, plan_id: plan.id });
    nav("/results");
  };

  const changeTransfer = async (i: number, mode: Transfer) => {
    const before = plan;
    setSaving(true);
    setMsg("");
    setPlan({ ...plan, transfers: plan.transfers.map((x, n) => (n === i ? mode : x)) });
    try {
      setPlan(await setTransfers(plan.id, plan.transfers.map((x, n) => (n === i ? mode : x))));
    } catch {
      setPlan(before);
      setMsg(t("multi.transferFailed"));
    } finally {
      setSaving(false);
    }
  };

  // The next move between cities, going by the calendar only.
  const nextMove = plan.legs.findIndex((leg, i) => i > 0 && leg.start_date >= today());
  const onTabKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const to = (tab + step + plan.legs.length) % plan.legs.length;
    setTab(to);
    document.getElementById(`citytab-${to}`)?.focus();
  };

  const leg = plan.legs[tab];
  const itinerary = byCity[leg.region];
  const pending = bookingFor(leg);

  return (
    <div className="page wide">
      {back}
      <h1>{plan.legs.map(city).join(" → ")}</h1>
      <p className="muted">{plan.legs[0].start_date} – {plan.legs[plan.legs.length - 1].end_date}</p>

      <TripProgress items={allItems} title={t("multi.overall")} />
      {nextMove > 0 && (
        <p className="notice">
          {t("multi.nextTransfer", {
            from: city(plan.legs[nextMove - 1]), to: city(plan.legs[nextMove]), date: plan.legs[nextMove - 1].end_date,
            mode: t(`multi.modes.${plan.transfers[nextMove - 1]}`),
          })}
        </p>
      )}

      <section>
        <h2>{t("multi.route")}</h2>
        <p role="alert" className="error">{msg}</p>
        <ol className="route">
          {plan.legs.map((x, i) => {
            const it = byCity[x.region];
            const s = it ? summarize(it.items) : null;
            const b = bookingFor(x);
            const gap = i > 0 ? daysBetween(plan.legs[i - 1].end_date, x.start_date) : 0;
            const modes = i > 0 ? transferModes(plan.legs[i - 1].region, x.region) : [];
            const mode = i > 0 ? plan.transfers[i - 1] : "";
            const info = mode ? TRANSFER_INFO[mode] : undefined;
            return (
              <li key={x.region}>
                {i > 0 && (
                  <div className="transfer">
                    <label>{t("multi.transferBy", { from: city(plan.legs[i - 1]), to: city(x) })}
                      <select value={mode} disabled={saving} onChange={(e) => changeTransfer(i - 1, e.target.value as Transfer)}>
                        <option value="">{t("multi.modes.")}</option>
                        {/* a mode saved earlier stays selectable even if the cities were since reordered */}
                        {[...new Set([...modes, ...(mode ? [mode] : [])])].map((m) => <option key={m} value={m}>{t(`multi.modes.${m}`)}</option>)}
                      </select>
                    </label>
                    <p className="muted">
                      {t("multi.transferOn", { date: plan.legs[i - 1].end_date })}
                      {gap === 0 && ` · ${t("multi.sameDay")}`}
                      {gap > 1 && ` · ${t("multi.gap", { count: gap - 1 })}`}
                    </p>
                    <p className="muted">
                      {info
                        ? <a href={info.url} target="_blank" rel="noopener noreferrer">{t("multi.info", { name: info.name })}</a>
                        : t("multi.noInfo")}
                    </p>
                  </div>
                )}
                <button type="button" className={"legcard" + (i === tab ? " on" : "")} onClick={() => setTab(i)}>
                  <strong>{i + 1}. {city(x)}</strong>
                  <span>{x.start_date} – {x.end_date} · {t("guide.days", { count: stayDays(x) })}</span>
                  <span className="muted">
                    {s ? t("multi.visitedOf", { n: s.visited, total: s.total })
                      : b?.status === "pending" ? t("multi.waiting", { name: loc(b.guide_name, b.guide_name_ko) })
                      : t("multi.noGuide")}
                  </span>
                  {s && <progress max={100} value={s.percent} aria-label={t("multi.cityProgress", { city: city(x) })} />}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div role="tablist" aria-label={t("multi.cityTabs")} className="citytabs" onKeyDown={onTabKey}>
        {plan.legs.map((x, i) => (
          <button
            key={x.region} type="button" role="tab" id={`citytab-${i}`} aria-selected={i === tab} aria-controls="citypanel"
            tabIndex={i === tab ? 0 : -1} onClick={() => setTab(i)}
          >{city(x)}</button>
        ))}
      </div>
      <div role="tabpanel" id="citypanel" aria-labelledby={`citytab-${tab}`} className="citypanel">
        {itinerary ? (
          <>
            <p className="muted">{t("trips.withGuide", { name: loc(itinerary.guide_name, itinerary.guide_name_ko) })} · {leg.start_date} – {leg.end_date}</p>
            <ItineraryView key={itinerary.id} itinerary={itinerary} onChange={onItinerary} role="tourist" progressTitle={t("multi.cityProgress", { city: city(leg) })} />
          </>
        ) : pending?.status === "pending" ? (
          <>
            <p>{t("multi.waitingIntro", { name: loc(pending.guide_name, pending.guide_name_ko), city: city(leg) })}</p>
            <Link to="/bookings" className="ghost btn">{t("multi.seeBookings")}</Link>
          </>
        ) : (
          <>
            {pending && <p className="notice check">{t("multi.declined", { name: loc(pending.guide_name, pending.guide_name_ko) })}</p>}
            <p>{t("multi.findIntro", { city: city(leg) })}</p>
            <button type="button" className="primary" onClick={() => findGuide(leg)}>{t("multi.findGuide", { city: city(leg) })}</button>
          </>
        )}
      </div>
    </div>
  );
}
