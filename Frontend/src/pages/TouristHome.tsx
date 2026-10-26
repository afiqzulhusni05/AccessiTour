import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listBookings, listItineraries } from "../api";
import BookingList from "../BookingList";
import { useAuth } from "../AuthContext";
import { Loading, Panel, Tile } from "../Dash";
import TripList from "../TripList";
import { useLoad } from "../useLoad";

export default function TouristHome() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const { data, setData, failed } = useLoad(() => Promise.all([listItineraries(), listBookings()]));
  const [trips, bookings] = data ?? [null, []];
  const pending = bookings.filter((b) => b.status === "pending");
  const reload = () => Promise.all([listItineraries(), listBookings()]).then(setData).catch(() => {});

  return (
    <div className="page full">
      <h1>{t("dash.welcome", { name: user.display_name })}</h1>
      {!trips ? <Loading failed={failed} /> : (
        <>
          <div className="kpis">
            <Tile label={t("booking.pending")} value={pending.length} to="/bookings?status=pending" />
            <Tile label={t("dash.trips")} value={trips.length} to="/trips" />
            <Tile label={t("dash.waitingForYou")} value={trips.filter((x) => !x.approved_by_tourist).length} to="/trips?state=waiting" />
            <Tile label={t("dash.final")} value={trips.filter((x) => x.approved_by_tourist && x.approved_by_guide).length} to="/trips?state=final" />
          </div>
          <div className="panels">
            {pending.length > 0 && (
              <Panel title={t("booking.pending")} more="/bookings" span>
                <BookingList bookings={pending} viewer="tourist" onChange={reload} />
              </Panel>
            )}
            <Panel title={t("dash.yourTrips")} more={trips.length > 5 ? "/trips" : undefined} span>
              {trips.length === 0
                ? <p className="muted">{t("trips.emptyTourist")}</p>
                : <TripList trips={trips.slice(0, 5)} viewer="tourist" />}
              <div className="rowbtns"><Link to="/plan" className="primary btn">{t("dash.planCta")}</Link></div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
