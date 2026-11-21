import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listBookings, listItineraries, teamToken } from "../api";
import * as team from "../teamApi";
import BookingList from "../BookingList";
import { useAuth } from "../AuthContext";
import { Loading, Panel, Tile } from "../Dash";
import TripList from "../TripList";
import { useLoad } from "../useLoad";

export default function TouristHome() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  // Planned trips (no guide accepted yet) live apart from itineraries, so load both, like My trips does.
  const plannedTrips = () => {
    const tok = teamToken();
    return tok ? team.listTrips(tok).catch(() => [] as team.TeamTrip[]) : Promise.resolve([] as team.TeamTrip[]);
  };
  const loadAll = () => Promise.all([listItineraries(), listBookings(), plannedTrips()]);
  const { data, setData, failed } = useLoad(loadAll);
  const [trips, bookings, planned] = data ?? [null, [], []];
  const pending = bookings.filter((b) => b.status === "pending");
  const reload = () => loadAll().then(setData).catch(() => {});
  // A trip counts once, whether it is only planned or already has an itinerary.
  const tripCount = trips ? new Set([...planned.map((p) => p.id), ...trips.map((x) => x.trip_id ?? -x.id)]).size : 0;

  return (
    <div className="page full">
      <h1>{t("dash.welcome", { name: user.display_name })}</h1>
      {!trips ? <Loading failed={failed} /> : (
        <>
          <div className="kpis">
            <Tile label={t("booking.pending")} value={pending.length} to="/bookings?status=pending" />
            <Tile label={t("dash.trips")} value={tripCount} to="/trips" />
            <Tile label={t("dash.waitingForYou")} value={trips.filter((x) => !x.approved_by_tourist).length} to="/trips?state=waiting" />
            <Tile label={t("dash.final")} value={trips.filter((x) => x.approved_by_tourist && x.approved_by_guide).length} to="/trips?state=final" />
          </div>
          <div className="panels">
            {pending.length > 0 && (
              <Panel title={t("booking.pending")} more="/bookings" span>
                <BookingList bookings={pending} viewer="tourist" onChange={reload} />
              </Panel>
            )}
            <Panel title={t("dash.yourTrips")} more={trips.length > 5 || planned.length > 5 ? "/trips" : undefined} span>
              {trips.length === 0 && planned.length === 0 && <p className="muted">{t("trips.emptyTourist")}</p>}
              {planned.length > 0 && (
                <ul className="triplist">
                  {planned.slice(0, 5).map((x) => (
                    <li key={x.id}>
                      <Link to={`/t/${x.id}`}>{x.segments.map((s) => t(`region.${s.region.toLowerCase()}`)).join(" → ")}</Link>
                      <p className="muted">{x.start_date} – {x.end_date}</p>
                    </li>
                  ))}
                </ul>
              )}
              {trips.length > 0 && <TripList trips={trips.slice(0, 5)} viewer="tourist" />}
              <div className="rowbtns"><Link to="/plan" className="primary btn">{t("dash.planCta")}</Link></div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
