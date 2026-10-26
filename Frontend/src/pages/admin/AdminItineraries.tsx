import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listItineraries } from "../../api";
import { FilterNote, Loading } from "../../Dash";
import TripList from "../../TripList";
import { useLoad } from "../../useLoad";

export default function AdminItineraries() {
  const { t } = useTranslation();
  const { data: trips, failed } = useLoad(listItineraries);
  // ?state=final and ?city=<id>, set by the dashboard
  const [params] = useSearchParams();
  const final = params.get("state") === "final";
  const city = params.get("city");
  const shown = trips?.filter((x) => (!final || (x.approved_by_tourist && x.approved_by_guide)) && (!city || x.region === city));
  const label = [final && t("dash.finalItineraries"), city && t(`region.${city}`)].filter(Boolean).join(" · ");

  return (
    <div className="page full">
      <h1>{t("nav.itineraries")}{trips && ` (${trips.length})`}</h1>
      {!trips ? <Loading failed={failed} />
        : trips.length === 0 ? <p className="muted">{t("trips.emptyAdmin")}</p>
          : (
            <>
              {label && <FilterNote label={label} all="/admin/itineraries" />}
              {shown!.length === 0 ? <p>{t("dash.noMatches")}</p> : <TripList trips={shown!} viewer="admin" />}
            </>
          )}
    </div>
  );
}
