import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, getItinerary, listBookings, requestTeamBooking, teamToken } from "../api";
import BookingList from "../BookingList";
import ItineraryView from "../ItineraryView";
import { stayDays } from "../multiCity";
import { summarize } from "../progress";
import * as team from "../teamApi";
import TripProgress from "../TripProgress";
import type { Booking, Itinerary } from "../types";

const OPEN: Booking["status"][] = ["pending", "accepted", "completed"]; // a segment with one of these is taken

/**
 * A trip saved in the team API: one tab per city (segment). Each tab shows the team matcher's guides until one is
 * booked, then the booking, and once the guide accepts, the itinerary (kept in the local backend).
 */
export default function TeamTripPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [trip, setTrip] = useState<team.TeamTrip | null>(null);
  const [matches, setMatches] = useState<Record<number, team.TeamSegmentMatches>>({}); // by segment id
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [itineraries, setItineraries] = useState<Record<number, Itinerary>>({}); // by booking id
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<number | null>(null); // guide being requested
  const [msg, setMsg] = useState("");

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

  const seg = trip.segments[tab];
  const booking = bookingFor(seg);
  const itinerary = booking ? itineraries[booking.id] : undefined;
  const found = matches[seg.id];
  const multi = trip.segments.length > 1;

  return (
    <div className="page wide">
      {back}
      <h1>{trip.segments.map(city).join(" → ")}</h1>
      <p className="muted">{trip.start_date} – {trip.end_date}</p>
      {allItems.length > 0 && <TripProgress items={allItems} title={multi ? t("multi.overall") : undefined} />}

      {multi && (
        <div role="tablist" aria-label={t("multi.cityTabs")} className="citytabs" onKeyDown={onTabKey}>
          {trip.segments.map((s, i) => {
            const b = bookingFor(s);
            const its = b && itineraries[b.id];
            return (
              <button key={s.id} type="button" role="tab" id={`segtab-${i}`} aria-selected={i === tab} aria-controls="segpanel"
                tabIndex={i === tab ? 0 : -1} onClick={() => { setTab(i); setMsg(""); }}>
                {city(s)}
                <small>{its ? ` · ${summarize(its.items).percent}%` : b ? ` · ${t(`booking.status.${b.status}`)}` : ""}</small>
              </button>
            );
          })}
        </div>
      )}

      <div role={multi ? "tabpanel" : undefined} id="segpanel" aria-labelledby={multi ? `segtab-${tab}` : undefined} className="citypanel">
        <p className="muted">
          {city(seg)} · {seg.start_date} – {seg.end_date} · {t("guide.days", { count: stayDays(seg) })}
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
              <ol className="guides">
                {found.items.map((m) => {
                  const partly = m.breakdown.find((f) => f.factor === "availability" && f.score < 1);
                  return (
                    <li key={m.guide.id} className="teamguide">
                      <div className="who">
                        <h3>{m.guide.full_name}{m.guide.verified && <span className="sampletag">{t("teamtrip.verified")}</span>}</h3>
                        <p className="muted">
                          {m.guide.languages.map((l) => t(`lang.${l}`)).join(", ")} · {m.guide.rating_count
                            ? `★ ${m.guide.rating_average.toFixed(1)} (${m.guide.rating_count} ${t("results.reviews")})` : t("results.newGuide")}
                        </p>
                        <p className="price">₩{m.estimated_price.toLocaleString()} <small>{t("teamtrip.forStay")}</small></p>
                        <ul className="reasons">
                          {m.breakdown.map((f) => (
                            <li key={f.factor} className={f.score >= 0.99 ? "good" : "weak"}>
                              <span aria-hidden="true">{f.score >= 0.99 ? "✓" : "–"}</span>
                              <span><strong>{t(`tfactor.${f.factor}`)}:</strong> {f.reason}</span>
                            </li>
                          ))}
                        </ul>
                        {partly && <p className="warn">{t("teamtrip.partly")}</p>}
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
