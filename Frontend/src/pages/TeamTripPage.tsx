import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, deleteTrip, getItinerary, listBookings, requestTeamBooking, teamToken } from "../api";
import BookingList from "../BookingList";
import ItineraryView from "../ItineraryView";
import { stayDays } from "../multiCity";
import { summarize } from "../progress";
import * as team from "../teamApi";
import TripProgress from "../TripProgress";
import Avatar from "../Avatar";
import GuideCalendar from "../GuideCalendar";
import type { Booking, Itinerary } from "../types";

/** The guide isn't free on every day of the stay, so they can't be requested for it. */
const isPartly = (m: team.TeamMatch) => m.breakdown.some((f) => f.factor === "availability" && f.score < 1);

const OPEN: Booking["status"][] = ["pending", "accepted", "completed"]; // a segment with one of these is taken

/**
 * A trip saved in the team API: one tab per city (segment). Each tab shows the team matcher's guides until one is
 * booked, then the booking, and once the guide accepts, the itinerary (kept in the local backend).
 */
export default function TeamTripPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const [trip, setTrip] = useState<team.TeamTrip | null>(null);
  const [matches, setMatches] = useState<Record<number, team.TeamSegmentMatches>>({}); // by segment id
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [itineraries, setItineraries] = useState<Record<number, Itinerary>>({}); // by booking id
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<number | null>(null); // guide being requested
  const [msg, setMsg] = useState("");
  const [calFor, setCalFor] = useState<string | null>(null); // "segment:guide" whose availability calendar is open

  const load = useCallback(async () => {
    const tok = teamToken()!;
    const tripId = Number(id);
    const [tr, m, all] = await Promise.all([team.getTrip(tok, tripId), team.tripMatches(tok, tripId), listBookings()]);
    const mine = all.filter((b) => b.team?.trip_id === tripId);
    const its = await Promise.all(mine.filter((b) => b.itinerary_id !== null).map(async (b) => [b.id, await getItinerary(b.itinerary_id!)] as const));
    setTrip(tr);
    setMatches(Object.fromEntries(m.segments.map((s) => [s.segment.id, s])));
    setBookings(mine);
    setItineraries(Object.fromEntries(its));
  }, [id]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    load().catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [load]);

  const onItinerary = useCallback((it: Itinerary) => setItineraries((prev) => ({ ...prev, [it.trip.team_booking_id!]: it })), []);

  const back = <Link to="/trips" className="backlink">← {t("multi.back")}</Link>;
  if (failed) return <div className="page wide">{back}<p role="alert" className="error">{t("multi.notFound")}</p></div>;
  if (!trip) return <div className="page wide"><p role="status">{t("multi.loading")}</p></div>;

  const city = (s: team.TeamSegment) => t(`region.${s.region.toLowerCase()}`);
  const bookingFor = (s: team.TeamSegment) =>
    [...bookings].sort((a, b) => b.id - a.id).find((b) => b.team?.segment_id === s.id && OPEN.includes(b.status));
  const turnedDown = (s: team.TeamSegment) =>
    bookings.filter((b) => b.team?.segment_id === s.id && (b.status === "declined" || b.status === "cancelled"));
  const allItems = trip.segments.flatMap((s) => { const b = bookingFor(s); return (b && itineraries[b.id]?.items) || []; });

  const request = async (s: team.TeamSegment, m: team.TeamMatch) => {
    setBusy(m.guide.id);
    setMsg("");
    try {
      await requestTeamBooking(s.id, m.guide.id);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError && e.detail ? e.detail : t("booking.requestFailed"));
    } finally {
      setBusy(null);
    }
  };
  const onTabKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const to = (tab + step + trip.segments.length) % trip.segments.length;
    setTab(to);
    document.getElementById(`segtab-${to}`)?.focus();
  };

  const shortDate = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const seg = trip.segments[tab];
  const booking = bookingFor(seg);
  const itinerary = booking ? itineraries[booking.id] : undefined;
  const found = matches[seg.id];
  const multi = trip.segments.length > 1;

  return (
    <div className="page wide">
      {back}
      {/* short sessions are one segment per day, so a city can repeat: name each city once, in order */}
      <h1>{trip.segments.map(city).filter((c, i, all) => c !== all[i - 1]).join(" → ")}</h1>
      <div className="head">
        <p className="muted">{trip.start_date} – {trip.end_date}</p>
        <button type="button" className="ghost small danger" onClick={async () => {
          if (!window.confirm(t("teamtrip.confirmDelete"))) return;
          setMsg("");
          try {
            await deleteTrip(trip.id);
            nav("/trips");
          } catch (e) {
            setMsg(e instanceof ApiError && e.detail ? e.detail : t("teamtrip.deleteFailed"));
          }
        }}>{t("teamtrip.delete")}</button>
      </div>
      {msg && booking && <p role="alert" className="error">{msg}</p>}
      {allItems.length > 0 && <TripProgress items={allItems} title={multi ? t("multi.overall") : undefined} />}

      {multi && (
        <div role="tablist" aria-label={t("multi.cityTabs")} className="citytabs" onKeyDown={onTabKey}>
          {trip.segments.map((s, i) => {
            const b = bookingFor(s);
            const its = b && itineraries[b.id];
            return (
              <button key={s.id} type="button" role="tab" id={`segtab-${i}`} aria-selected={i === tab} aria-controls="segpanel"
                tabIndex={i === tab ? 0 : -1} onClick={() => { setTab(i); setMsg(""); }}>
                {city(s)}{s.service_type === "MICRO" && <small> {shortDate(s.start_date)}</small>}
                <small>{its ? ` · ${summarize(its.items).percent}%` : b ? ` · ${t(`booking.status.${b.status}`)}` : ""}</small>
              </button>
            );
          })}
        </div>
      )}

      <div role={multi ? "tabpanel" : undefined} id="segpanel" aria-labelledby={multi ? `segtab-${tab}` : undefined} className="citypanel">
        <p className="muted">
          {city(seg)} · {seg.service_type === "MICRO" && seg.start_time && seg.end_time
            ? `${seg.start_date} · ${seg.start_time.slice(0, 5)}–${seg.end_time.slice(0, 5)}`
            : `${seg.start_date} – ${seg.end_date} · ${t("guide.days", { count: stayDays(seg) })}`}
          {seg.budget ? ` · ${t("teamtrip.budget", { amount: seg.budget.toLocaleString() })}` : ""}
        </p>

        {itinerary ? (
          <ItineraryView key={itinerary.id} itinerary={itinerary} onChange={onItinerary} role="tourist"
            progressTitle={multi ? t("multi.cityProgress", { city: city(seg) }) : undefined} />
        ) : booking ? (
          <BookingList bookings={[booking]} viewer="tourist" onChange={() => { load().catch(() => setFailed(true)); }} />
        ) : (
          <>
            {turnedDown(seg).length > 0 && <p className="notice check">{t("teamtrip.again")}</p>}
            <h2>{t("teamtrip.guidesFor", { city: city(seg) })}</h2>
            <p role="alert" className="error">{msg}</p>
            {!found || found.items.length === 0 ? (
              <p>{t("teamtrip.none")}</p>
            ) : (
              <>
              {/* Guides who can be booked come first, each group by match score: a high score is no use if the
                  Request button is off. Guides free on only some days are listed after, under their own heading. */}
              {[false, true].map((later) => {
                const group = found.items
                  .filter((m) => isPartly(m) === later)
                  .sort((a, b) => b.total_score - a.total_score);
                if (group.length === 0) return null;
                return (
              <div key={String(later)}>
              {later && <h3 className="guides-split">{t("teamtrip.someDays", { count: group.length })}</h3>}
              <ol className="guides">
                {group.map((m) => {
                  const partly = m.breakdown.find((f) => f.factor === "availability" && f.score < 1);
                  return (
                    <li key={m.guide.id} className="teamguide">
                      <div className="who">
                        <div className="whohead">
                          <Avatar name={m.guide.full_name} photo={m.guide.photo_url} size="lg" />
                          <div>
                        <h3>{m.guide.full_name}{m.guide.verified && <span className="sampletag">{t("teamtrip.verified")}</span>}</h3>
                        <p className="muted">
                          {m.guide.languages.map((l) => t(`lang.${l}`)).join(", ")} · {m.guide.rating_count
                            ? `★ ${m.guide.rating_average.toFixed(1)} (${m.guide.rating_count} ${t("results.reviews")})` : t("results.newGuide")}
                        </p>
                          </div>
                        </div>
                        <p className="price">₩{m.estimated_price.toLocaleString()} <small>{t(seg.service_type === "MICRO" ? "teamtrip.forSession" : "teamtrip.forStay")}</small></p>
                        <ul className="reasons">
                          {m.breakdown.map((f) => (
                            <li key={f.factor} className={f.score >= 0.99 ? "good" : "weak"}>
                              <span aria-hidden="true">{f.score >= 0.99 ? "✓" : "–"}</span>
                              <span><strong>{t(`tfactor.${f.factor}`)}:</strong> {f.reason}</span>
                            </li>
                          ))}
                        </ul>
                        {partly && <p className="warn">{t("teamtrip.partly")}</p>}
                        {partly && (() => {
                          const key = `${seg.id}:${m.guide.id}`;
                          const open = calFor === key;
                          return (<>
                            <button type="button" className="textlink" aria-expanded={open} onClick={() => setCalFor(open ? null : key)}>
                              {t(open ? "teamtrip.hideDays" : "teamtrip.whichDays")}
                            </button>
                            {open && <GuideCalendar guide={m.guide} seg={seg} />}
                          </>);
                        })()}
                      </div>
                      <div className="score">
                        <div className="strip" role="img" aria-label={`${t("results.match")} ${Math.round(m.total_score)}%`}>
                          <span style={{ width: `${Math.round(m.total_score)}%` }} />
                        </div>
                        <strong>{Math.round(m.total_score)}%</strong>
                        <button type="button" className="primary small" disabled={busy !== null || Boolean(partly)} onClick={() => request(seg, m)}>
                          {busy === m.guide.id ? t("teamtrip.requesting") : t("teamtrip.request")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              </div>
                );
              })}
              </>
            )}
            {found && found.excluded.length > 0 && (
              <details className="excluded">
                <summary>{t("teamtrip.excluded", { count: found.excluded.length })}</summary>
                <ul>{found.excluded.map((x) => <li key={x.guide_id}><strong>{x.full_name}</strong>: {x.reason}</li>)}</ul>
              </details>
            )}
            <p className="footnote">{t("teamtrip.scoreNote")}</p>
          </>
        )}
      </div>
    </div>
  );
}
