import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  detectPlatform, hasCoords, MODES, navigationLink, NAVER_IOS_STORE, placeLink, PROVIDERS, routeLink,
  type Env, type MapLink, type MapProvider, type Place, type TravelMode,
} from "./mapLinks";

export interface NavPrefs { provider: MapProvider; mode: TravelMode }
const KEY = "accessitour-map";
const APP_WAIT_MS = 2000; // if the page is still in front after this, the map app did not open

const env = (): Env => ({
  platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
  appName: window.location.origin,
});

/** The chosen map app and way of travelling. Kept in this browser only: it is a convenience, not account data. */
export function useNavPrefs(): [NavPrefs, (p: NavPrefs) => void] {
  const [prefs, setPrefs] = useState<NavPrefs>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      return {
        provider: PROVIDERS.includes(saved.provider) ? saved.provider : "naver",
        mode: MODES.includes(saved.mode) ? saved.mode : "transit",
      };
    } catch {
      return { provider: "naver", mode: "transit" };
    }
  });
  const save = (p: NavPrefs) => {
    setPrefs(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* still applies to this visit */ }
  };
  return [prefs, save];
}

/** One control for the whole itinerary: which map app the stop links open, and how the person is travelling. */
export function NavSettings({ prefs, onChange, hasNeeds }: {
  prefs: NavPrefs;
  onChange: (p: NavPrefs) => void;
  hasNeeds: boolean; // the trip was planned with a mobility need
}) {
  const { t } = useTranslation();
  const onComputer = env().platform === "desktop";
  return (
    <section className="navset" aria-label={t("go.title")}>
      <h2>{t("go.title")}</h2>
      <div className="navset-row">
        <fieldset>
          <legend className="fieldlabel">{t("go.app")}</legend>
          <div className="chips">
            {PROVIDERS.map((p) => (
              <label key={p} className="chip">
                <input type="radio" name="map-app" checked={prefs.provider === p} onChange={() => onChange({ ...prefs, provider: p })} />
                <span>{t(`go.provider.${p}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="fieldlabel">{t("go.mode")}
          <select value={prefs.mode} onChange={(e) => onChange({ ...prefs, mode: e.target.value as TravelMode })}>
            {MODES.map((m) => <option key={m} value={m}>{t(`go.modes.${m}`)}</option>)}
          </select>
        </label>
      </div>
      {prefs.provider === "naver" && onComputer && <p className="muted">{t("go.naverComputer")}</p>}
      <p className={"notice" + (hasNeeds ? " check" : "")}>{t("go.accessNote")}</p>
    </section>
  );
}

/** The map links under one stop. `prev` is the stop before it on the same day. */
export function StopNav({ place, prev, prefs, near }: { place: Place; prev?: Place; prefs: NavPrefs; near: string }) {
  const { t } = useTranslation();
  const [missing, setMissing] = useState(false); // the phone's map app did not open
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => setMissing(false), [prefs.provider]);

  const e = env();
  const app = t(`go.provider.${prefs.provider}`);
  const show = placeLink(prefs.provider, place, e, near);
  if (!show) return null; // no position and no name: nothing honest to link to
  const placed = hasCoords(place);
  const links: [string, MapLink][] = [[t(show.kind === "search" ? "go.search" : "go.show", { app }), show]];
  const fromHere = routeLink(prefs.provider, place, prefs.mode, e);
  if (fromHere) links.push([t("go.fromHere"), fromHere]);
  const fromPrev = prev && hasCoords(prev) ? routeLink(prefs.provider, place, prefs.mode, e, prev) : null;
  if (fromPrev) links.push([t("go.fromPrev", { place: prev!.name }), fromPrev]);
  const drive = prefs.mode === "car" ? navigationLink(prefs.provider, place, e) : null;
  if (drive) links.push([t("go.drive"), drive]);

  // An app link gives the page no answer. If we are still on screen a moment later, the app is probably not installed.
  const watch = (link: MapLink) => {
    if (!link.needsApp || e.platform !== "ios") return; // Android's intent link goes to the Play Store by itself
    setMissing(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => document.visibilityState === "visible" && setMissing(true), APP_WAIT_MS);
  };

  return (
    <div className="stopnav">
      <ul aria-label={t("go.linksFor", { place: place.name, app })}>
        {links.map(([label, link]) => (
          <li key={link.url}>
            <a
              href={link.url} className="ghost btn small" onClick={() => watch(link)}
              {...(link.needsApp ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            >{label}<span className="sr-only"> ({app}, {place.name})</span></a>
          </li>
        ))}
      </ul>
      {!placed && <p className="muted">{t("go.byName", { app })}</p>}
      {missing && (
        <p role="alert" className="muted">
          {t("go.appMissing", { app })} <a href={NAVER_IOS_STORE} target="_blank" rel="noopener noreferrer">{t("go.getApp", { app })}</a>
        </p>
      )}
    </div>
  );
}
