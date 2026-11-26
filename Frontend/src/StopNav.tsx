import { useTranslation } from "react-i18next";
import { directionsLink, hasCoords, showLink, type Place, type TravelMode } from "./mapLinks";

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

/** The Kakao Map links under one stop: directions to it from `prev` (the stop before it that day) and from the person's own location. */
export function StopNav({ place, prev, mode, near }: { place: Place; prev?: Place; mode?: TravelMode; near: string }) {
  const { t } = useTranslation();
  // Kakao's directions page already shows the place on the map, so a separate "Show in Kakao Map" link would
  // repeat it. With a position: directions from the stop before (when there is one) and from where you are now.
  // Without one: a search by name.
  const links: [string, string][] = [];
  if (hasCoords(place)) {
    if (prev && hasCoords(prev)) links.push([t("go.fromPrev", { place: prev.name }), directionsLink(place, prev, mode)!]);
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
