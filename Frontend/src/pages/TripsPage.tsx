import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listItineraries, listPlans } from "../api";
import { useAuth } from "../AuthContext";
import { FilterNote } from "../Dash";
import TripList from "../TripList";
import type { ItinerarySummary, TripPlan } from "../types";

/** A tourist's own trips, or the trips travellers have planned with this guide. */
export default function TripsPage() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const [trips, setTrips] = useState<ItinerarySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [plans, setPlans] = useState<TripPlan[]>([]); // multi-city trips; tourists only

  useEffect(() => {
    let live = true;
    listItineraries().then((x) => live && setTrips(x)).catch(() => live && setFailed(true));
    if (user.role === "tourist") listPlans().then((x) => live && setPlans(x)).catch(() => {});
    return () => { live = false; };
  }, [user.role]);

  // ?state=waiting | final, set by the dashboard tiles
  const state = useSearchParams()[0].get("state");
  const mine = (x: ItinerarySummary) => (user.role === "guide" ? x.approved_by_guide : x.approved_by_tourist);
  const shown = trips?.filter((x) =>
    state === "final" ? x.approved_by_tourist && x.approved_by_guide : state === "waiting" ? !mine(x) : true);

  const empty = { tourist: "trips.emptyTourist", guide: "trips.emptyGuide", admin: "trips.emptyAdmin" }[user.role];

  return (
    <div className="page wide">
      <h1>{t("trips.title")}</h1>
      {!trips && !failed && <p role="status">{t("trips.loading")}</p>}
      {failed && <p role="alert" className="error">{t("trips.error")}</p>}
      {plans.length > 0 && !state && (
        <section>
          <h2>{t("multi.title")}</h2>
          <ul className="triplist">
            {plans.map((p) => (
              <li key={p.id}>
                <Link to={`/plans/${p.id}`}>{p.legs.map((leg) => t(`region.${leg.region}`)).join(" → ")}</Link>
                <p className="muted">{p.legs[0].start_date} – {p.legs[p.legs.length - 1].end_date}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trips?.length === 0 && plans.length === 0 && (
        <>
          <p>{t(empty)}</p>
          {user.role === "tourist" && <Link to="/plan" className="primary btn">{t("trips.planOne")}</Link>}
        </>
      )}
      {(state === "final" || state === "waiting") && <FilterNote label={t(state === "final" ? "dash.final" : "dash.waitingForYou")} all="/trips" />}
      {shown && trips!.length > 0 && (shown.length === 0 ? <p>{t("dash.noMatches")}</p> : <TripList trips={shown} viewer={user.role} />)}
    </div>
  );
}
