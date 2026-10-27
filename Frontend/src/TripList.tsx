import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalized } from "./names";
import type { AccountRole, ItinerarySummary } from "./types";

/** Itineraries as a list of links. `viewer` decides whether the guide or the traveller is the headline. */
export default function TripList({ trips, viewer }: { trips: ItinerarySummary[]; viewer: AccountRole }) {
  const { t } = useTranslation();
  const loc = useLocalized();

  const state = (x: ItinerarySummary) =>
    x.approved_by_tourist && x.approved_by_guide ? "final"
      : x.approved_by_tourist ? "waitingGuide"
        : x.approved_by_guide ? "waitingTourist" : "waitingBoth";

  return (
    <ul className="triplist">
      {trips.map((x) => {
        const guide = t("trips.withGuide", { name: loc(x.guide_name, x.guide_name_ko) });
        const traveller = t("trips.traveller", { name: x.owner_name });
        return (
          <li key={x.id}>
            <Link to={`/trips/${x.id}`}>
              {t(`region.${x.region}`)} · {viewer === "tourist" ? guide : traveller}
            </Link>
            <span className={"state " + state(x)}>{t(`trips.${state(x)}`)}</span>
            <p className="muted">
              {x.start_date} – {x.end_date} · {t("trips.stops", { count: x.stops })}
              {viewer === "admin" && ` · ${guide}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
