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

/**
 * The Kakao Map links under one stop. Directions start from `prev`, the stop before it that day
 * (or from the person's own location for the first stop), and end at this stop.
 */
export function StopNav({ place, prev, mode, near }: { place: Place; prev?: Place; mode?: TravelMode; near: string }) {
  const { t } = useTranslation();
  const route = directionsLink(place, prev, mode);
  const show = showLink(place, near);
  if (!route && !show) return null; // no position and no name: nothing honest to link to
  const fromPrev = Boolean(prev && hasCoords(prev) && route);
  const links: [string, string][] = [];
  if (route) links.push([fromPrev ? t("go.fromPrev", { place: prev!.name }) : t("go.fromHere"), route]);
  if (show) links.push([t(hasCoords(place) ? "go.show" : "go.search"), show]);
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
