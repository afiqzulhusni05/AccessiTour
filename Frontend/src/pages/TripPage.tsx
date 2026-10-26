import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getItinerary } from "../api";
import { useAuth } from "../AuthContext";
import ItineraryView from "../ItineraryView";
import { useLocalized } from "../names";
import type { Itinerary } from "../types";

/** One itinerary by id, for whoever is signed in: its tourist, its guide, or the admin (read-only). */
export default function TripPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { id } = useParams();
  const user = useAuth().user!;
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setItinerary(null);
    setFailed(false);
    getItinerary(Number(id))
      .then((it) => live && setItinerary(it))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [id]);

  const back = <Link to={user.role === "admin" ? "/admin/itineraries" : "/trips"} className="backlink">← {t(user.role === "admin" ? "nav.itineraries" : "trips.back")}</Link>;
  if (failed) return <div className="page wide">{back}<p role="alert" className="error">{t("trips.notFound")}</p></div>;
  if (!itinerary) return <div className="page wide"><p role="status">{t("trips.loading")}</p></div>;

  const p = itinerary.trip;
  const guideName = loc(itinerary.guide_name, itinerary.guide_name_ko);
  const final = itinerary.approved_by_tourist && itinerary.approved_by_guide;
  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";
  const role = user.role === "admin" ? null : user.role;

  return (
    <div className="page wide">
      {back}
      {role === "tourist" ? (
        <>
          <h1>{t(final ? "itinerary.finalTitle" : "trips.title1", { name: guideName })}</h1>
          <p className="muted">{t("trips.guideSees", { name: guideName })}</p>
        </>
      ) : (
        <>
          <h1>{t(final ? "collab.guideFinalTitle" : "collab.guideTitle")}</h1>
          <p className="muted">{role ? t("collab.guideIntro", { name: guideName }) : t("trips.adminView")}</p>
          <section>
            <h2>{t("collab.tripTitle")}</h2>
            <dl className="facts">
              <dt>{t("auth.name")}</dt><dd>{itinerary.owner_name}</dd>
              <dt>{t("trip.region")}</dt><dd>{t(`region.${p.region}`)}</dd>
              <dt>{t("guide.dates")}</dt><dd>{p.start_date} – {p.end_date} ({t("guide.days", { count: itinerary.days })})</dd>
              <dt>{t("trip.party")}</dt><dd>{p.party_size}</dd>
              <dt>{t("trip.language")}</dt><dd>{list(p.languages, "lang")}</dd>
              <dt>{t("needs.mobility")}</dt><dd>{(t(`mobility.${p.mobility}`) as unknown as string[])[0]}</dd>
              <dt>{t("needs.interests")}</dt><dd>{list(p.interests, "interest")}</dd>
              <dt>{t("needs.dietary")}</dt><dd>{list(p.dietary, "diet")}</dd>
              {p.notes && <><dt>{t("collab.notes")}</dt><dd>{p.notes}</dd></>}
            </dl>
          </section>
        </>
      )}
      <ItineraryView itinerary={itinerary} onChange={setItinerary} role={role} />
    </div>
  );
}
