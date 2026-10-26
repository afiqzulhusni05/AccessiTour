import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listItineraries, teamToken } from "../api";
import * as team from "../teamApi";
import { useAuth } from "../AuthContext";
import { FilterNote } from "../Dash";
import TripList from "../TripList";
import type { ItinerarySummary } from "../types";

/** A tourist's own trips, or the trips travellers have planned with this guide. */
export default function TripsPage() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const [trips, setTrips] = useState<ItinerarySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [teamTrips, setTeamTrips] = useState<team.TeamTrip[]>([]); // trips saved in the team API

  useEffect(() => {
    let live = true;
    listItineraries().then((x) => live && setTrips(x)).catch(() => live && setFailed(true));
    const tok = teamToken();
    if (user.role === "tourist" && tok) team.listTrips(tok).then((x) => live && setTeamTrips(x)).catch(() => {});
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
      {teamTrips.length > 0 && !state && (
        <section>
          <h2>{t("teamtrip.planned")}</h2>
          <ul className="triplist">
            {teamTrips.map((x) => (
              <li key={x.id}>
                <Link to={`/t/${x.id}`}>{x.segments.map((s) => t(`region.${s.region.toLowerCase()}`)).join(" → ")}</Link>
                <p className="muted">{x.start_date} – {x.end_date}</p>
              </li>
            ))}
          </ul>
          {trips && trips.length > 0 && <h2>{t("teamtrip.itineraries")}</h2>}
        </section>
      )}
      {trips?.length === 0 && teamTrips.length === 0 && (
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
