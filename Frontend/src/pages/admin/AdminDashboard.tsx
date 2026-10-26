import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listBookings, listGuides, listItineraries, listMatches, listUsers } from "../../api";
import { Bars, Loading, Panel, Tile } from "../../Dash";
import { useLocalized } from "../../names";
import { ACCESS_TAGS } from "../../options";
import TripList from "../../TripList";
import { useLoad } from "../../useLoad";

const count = <T,>(xs: T[], key: (x: T) => string) =>
  Object.entries(xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [key(x)]: (acc[key(x)] ?? 0) + 1 }), {}));

export default function AdminDashboard() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data, failed } = useLoad(() => Promise.all([listUsers(), listItineraries(), listGuides(), listBookings(), listMatches()]));
  if (!data) return <div className="page full"><h1>{t("dash.adminTitle")}</h1><Loading failed={failed} /></div>;

  const [users, trips, guides, bookings, matches] = data;
  const top = guides.filter((g) => g.review_count > 0).sort((a, b) => b.rating - a.rating || b.review_count - a.review_count).slice(0, 5);
  const cities = (regions: string[]) =>
    regions.slice(0, 2).map((r) => t(`region.${r}`)).join(", ") + (regions.length > 2 ? ` ${t("dash.more", { count: regions.length - 2 })}` : "");

  return (
    <div className="page full">
      <h1>{t("dash.adminTitle")}</h1>
      <p className="muted">{t("dash.adminIntro")}</p>
      <div className="kpis">
        <Tile label={t("dash.accounts")} value={users.length} to="/admin/users" />
        <Tile label={t("dash.tourists")} value={users.filter((u) => u.role === "tourist").length} to="/admin/users?role=tourist" />
        <Tile label={t("dash.guideProfiles")} value={guides.length} to="/admin/guides" />
        <Tile label={t("booking.total")} value={bookings.length} to="/bookings" />
        <Tile label={t("booking.pending")} value={bookings.filter((b) => b.status === "pending").length} to="/bookings?status=pending" />
        <Tile label={t("dash.itineraries")} value={trips.length} to="/admin/itineraries" />
        <Tile label={t("dash.finalItineraries")} value={trips.filter((x) => x.approved_by_tourist && x.approved_by_guide).length} to="/admin/itineraries?state=final" />
      </div>

      <div className="panels">
        <Panel title={t("matchlog.title")} span>
          {matches.length === 0 ? <p className="muted">{t("matchlog.none")}</p> : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("matchlog.when")}</th><th>{t("matchlog.tourist")}</th><th>{t("matchlog.city")}</th>
                    <th>{t("needs.mobility")}</th><th className="num">{t("matchlog.found")}</th><th>{t("matchlog.top")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(0, 8).map((m) => (
                    <tr key={m.at}>
                      <td>{new Date(m.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                      <td><Link to={`/admin/users?q=${encodeURIComponent(m.tourist)}`}>{m.tourist}</Link></td>
                      <td><Link to={`/admin/guides?q=${m.region}`}>{t(`region.${m.region}`)}</Link></td>
                      <td>{(t(`mobility.${m.mobility}`) as unknown as string[])[0]}</td>
                      <td className="num">{m.results}</td>
                      <td>{m.top_guide ? <Link to={`/admin/guides?q=${encodeURIComponent(m.top_guide)}`}>{m.top_guide} ({Math.round((m.top_score ?? 0) * 100)}%)</Link> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={t("dash.recentItineraries")} more="/admin/itineraries">
          {trips.length === 0 ? <p className="muted">{t("trips.emptyAdmin")}</p> : <TripList trips={trips.slice(0, 5)} viewer="admin" />}
        </Panel>
        <Panel title={t("dash.byCity")}>
          {trips.length === 0
            ? <p className="muted">{t("dash.noneYet")}</p>
            : <Bars rows={count(trips, (x) => x.region).map(([id, value]) => ({ label: t(`region.${id}`), value, to: `/admin/itineraries?city=${id}` }))} />}
        </Panel>
        <Panel title={t("dash.topGuides")} more="/admin/guides">
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>{t("dash.rank")}</th><th>{t("dash.guide")}</th><th>{t("dash.cities")}</th><th className="num">{t("dash.rating")}</th><th className="num">{t("dash.reviews")}</th></tr>
              </thead>
              <tbody>
                {top.map((g, i) => (
                  <tr key={g.id}>
                    <td>{i + 1}</td><td><Link to={`/admin/guides?q=${encodeURIComponent(g.name)}`}>{loc(g.name, g.name_ko)}</Link></td><td>{cities(g.regions)}</td>
                    <td className="num">★ {g.rating.toFixed(1)}</td><td className="num">{g.review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={t("dash.accessExperience")}>
          <Bars rows={ACCESS_TAGS.map((tag) => ({ label: t(`tag.${tag}`), value: guides.filter((g) => g.access_tags.includes(tag)).length, to: `/admin/guides?tag=${tag}` }))} />
        </Panel>
      </div>
    </div>
  );
}
