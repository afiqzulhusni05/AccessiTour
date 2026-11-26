import { useTranslation } from "react-i18next";
import { directionsLink, hasCoords, showLink, type Place } from "./mapLinks";

/** Above the stops: what the Kakao Map links do, and what map apps can't do for accessibility. */
export function NavNote({ hasNeeds }: { hasNeeds: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="navset" aria-label={t("go.title")}>
      <h2>{t("go.title")}</h2>
      <p className="muted">{t("go.kakaoIntro")}</p>
      <p className={"notice" + (hasNeeds ? " check" : "")}>{t("go.accessNote")}</p>
    </section>
  );
}

/** The Kakao Map link under one stop: directions to it from wherever the person is right now (or a search by name). */
export function StopNav({ place, near }: { place: Place; near: string }) {
  const { t } = useTranslation();
  // Every stop works the same: one link, with directions from the person's current location (Kakao Map fills
  // it in), since during the trip they are rarely exactly at the previous stop. Kakao's directions page also
  // shows the place on the map. Without a saved position: a search by name.
  const links: [string, string][] = [];
  if (hasCoords(place)) {
    links.push([t("go.fromHere"), directionsLink(place)!]);
  } else {
    const search = showLink(place, near);
    if (search) links.push([t("go.search"), search]);
  }
  if (links.length === 0) return null; // no position and no name: nothing honest to link to
  return (
    <div className="stopnav">
      <ul aria-label={t("go.linksFor", { place: place.name })}>
        {links.map(([label, url]) => (
          <li key={url}>
            <a href={url} className="ghost btn small" target="_blank" rel="noopener noreferrer">
              {label}<span className="sr-only"> (Kakao Map, {place.name})</span>
            </a>
          </li>
        ))}
      </ul>
      {!hasCoords(place) && <p className="muted">{t("go.byName")}</p>}
    </div>
  );
}
