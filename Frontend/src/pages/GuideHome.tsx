import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getGuideProfile, listBookings, listItineraries } from "../api";
import BookingList from "../BookingList";
import { useAuth } from "../AuthContext";
import { Loading, Panel, Tile } from "../Dash";
import TripList from "../TripList";
import { useLoad } from "../useLoad";

export default function GuideHome() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const load = () => Promise.all([listItineraries(), getGuideProfile(), listBookings()]);
  const { data, setData, failed } = useLoad(load);
  if (!data) return <div className="page full"><Loading failed={failed} /></div>;

  const [trips, me, bookings] = data;
  const pending = bookings.filter((b) => b.status === "pending");
  const reload = () => load().then(setData).catch(() => {});
  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";

  return (
    <div className="page full">
      <h1>{t("dash.welcome", { name: user.display_name })}</h1>
      <div className="kpis">
        <Tile label={t("booking.pending")} value={pending.length} to="/bookings?status=pending" />
        <Tile label={t("dash.assigned")} value={trips.length} to="/trips" />
        <Tile label={t("dash.waitingForYou")} value={trips.filter((x) => !x.approved_by_guide).length} to="/trips?state=waiting" />
        <Tile label={t("dash.final")} value={trips.filter((x) => x.approved_by_tourist && x.approved_by_guide).length} to="/trips?state=final" />
      </div>
      <div className="panels">
        {pending.length > 0 && (
          <Panel title={t("nav.requests")} more="/bookings" span>
            <BookingList bookings={pending} viewer="guide" onChange={reload} />
          </Panel>
        )}
        <Panel title={t("nav.trips")} more={trips.length > 5 ? "/trips" : undefined}>
          {trips.length === 0
            ? <p className="muted">{t("trips.emptyGuide")}</p>
            : <TripList trips={trips.slice(0, 5)} viewer="guide" />}
        </Panel>
        <Panel title={t("dash.yourProfile")} more="/profile" moreLabel={t("dash.editProfile")}>
          {!me ? <p className="muted">{t("dash.profileMissing")}</p> : (
            <Link to="/profile" className="blocklink" aria-label={t("dash.editProfile")}>
            <dl className="facts">
              <dt>{t("dash.cities")}</dt><dd>{list(me.regions, "region")}</dd>
              <dt>{t("dash.languages")}</dt><dd>{list(me.languages, "lang")}</dd>
              <dt>{t("dash.rate")}</dt><dd>₩{me.daily_rate.toLocaleString()}</dd>
              <dt>{t("dash.specialities")}</dt><dd>{list(me.interests, "interest")}</dd>
              <dt>{t("factor.accessibility")}</dt><dd>{list(me.access_tags, "tag")}</dd>
            </dl>
            </Link>
          )}
        </Panel>
      </div>
    </div>
  );
}
