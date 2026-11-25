import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRecommendations, placeNameAt } from "./api";
import { cityById } from "./regions";
import { StopForm } from "./Stop";
import { directionsLink } from "./mapLinks";
import { KINDS, loadNearby, PIN_TEXT, type Kind, type NearbyPlace } from "./nearby";
import type { Itinerary, Recommendation, Recommendations, StopFields } from "./types";

const KOREA = [36.3, 127.8, 7]; // lat, lng, zoom when the trip's city is unknown

const pin = (kind: "stop" | "rec" | "pick" | Kind, text: string) =>
  L.divIcon({ className: `pin ${kind}`, html: `<span>${text}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

// Leaflet treats tooltip strings as HTML; place names come from users and the LLM, so pass a text node.
const label = (text: string) => {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
};

/** Itinerary map: shows the stops, lets the user add a clicked spot or an AI suggestion to the schedule. */
export default function TripMap({ itinerary: it, editable, busy, onAdd }: {
  itinerary: Itinerary;
  editable: boolean;
  busy: boolean;
  onAdd: (f: StopFields) => Promise<boolean>; // true when the server accepted it
}) {
  const { t, i18n } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layers = useRef({ near: L.layerGroup(), stops: L.layerGroup(), recs: L.layerGroup(), pick: L.layerGroup() });
  const fitted = useRef(false);
  const [recs, setRecs] = useState<Recommendations | null>(null);
  const [recState, setRecState] = useState<"idle" | "loading" | "error">("idle");
  const [draft, setDraft] = useState<StopFields | null>(null); // the place being added
  const [picking, setPicking] = useState(false);
  // Help nearby: which kinds are switched on, what was found, and whether each is loading.
  const [shown, setShown] = useState<Record<Kind, boolean>>({ restrooms: false, restaurants: false, hospitals: false });
  const [found, setFound] = useState<Partial<Record<Kind, NearbyPlace[]>>>({});
  const [nearState, setNearState] = useState<Partial<Record<Kind, "loading" | "error">>>({});
  const [accessibleOnly, setAccessibleOnly] = useState(true);

  // Map clicks are wired once, so they read the latest handler through a ref.
  const onPick = useRef<(lat: number, lng: number) => void>(() => {});
  onPick.current = async (lat, lng) => {
    if (!editable) return;
    const spot = { day_number: 1, start_time: "12:00", place_name: "", activity: "", lat, lng };
    setDraft(spot);
    setPicking(true);
    const name = await placeNameAt(lat, lng, i18n.language);
    setPicking(false);
    setDraft((d) => (d === spot ? { ...spot, place_name: name } : d)); // ignore if another spot was picked meanwhile
  };

  useEffect(() => {
    const city = cityById(it.trip.region);
    const [lat, lng, zoom] = city ? [city.lat, city.lng, city.zoom] : KOREA;
    const m = L.map(box.current!).setView([lat, lng], zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    Object.values(layers.current).forEach((l) => l.addTo(m));
    m.on("click", (e) => onPick.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); fitted.current = false; };
  }, [it.trip.region]);

  useEffect(() => {
    const group = layers.current.stops.clearLayers();
    const placed = it.items.filter((i) => i.lat !== null && i.lng !== null);
    placed.forEach((i) => {
      L.marker([i.lat!, i.lng!], { icon: pin("stop", String(i.day_number)), keyboard: false })
        .bindTooltip(label(`${t("itinerary.day", { n: i.day_number })} · ${i.start_time} · ${i.place_name}`))
        .addTo(group);
    });
    if (!fitted.current && placed.length) {
      map.current?.fitBounds(L.latLngBounds(placed.map((i) => [i.lat!, i.lng!])), { padding: [40, 40], maxZoom: 14 });
      fitted.current = true;
    }
  }, [it.items, t]);

  useEffect(() => {
    const group = layers.current.recs.clearLayers();
    recs?.places.forEach((r) => {
      L.marker([r.lat, r.lng], { icon: pin("rec", "+"), keyboard: false })
        .bindTooltip(label(r.place_name))
        .on("click", () => choose(r))
        .addTo(group);
    });
  }, [recs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const group = layers.current.pick.clearLayers();
    if (draft?.lat != null && draft.lng != null) {
      L.marker([draft.lat, draft.lng], { icon: pin("pick", "+"), keyboard: false, interactive: false }).addTo(group);
    }
  }, [draft]);

  useEffect(() => {
    const group = layers.current.near.clearLayers();
    KINDS.filter((k) => shown[k]).forEach((k) => {
      (found[k] ?? []).forEach((p) => {
        L.marker([p.lat, p.lng], { icon: pin(k, PIN_TEXT[k]), keyboard: false })
          .bindTooltip(label([p.name, ...p.details.slice(0, 1)].join(" · ")))
          .addTo(group);
      });
    });
  }, [shown, found]);

  const fetchNearby = async (kind: Kind, onlyAccessible = accessibleOnly) => {
    const c = map.current!.getCenter();
    setNearState((s) => ({ ...s, [kind]: "loading" }));
    try {
      const places = await loadNearby(kind, c.lat, c.lng, onlyAccessible);
      setFound((f) => ({ ...f, [kind]: places }));
      setNearState((s) => ({ ...s, [kind]: undefined }));
    } catch {
      setNearState((s) => ({ ...s, [kind]: "error" }));
    }
  };

  const toggleNearby = (kind: Kind) => {
    const on = !shown[kind];
    setShown((s) => ({ ...s, [kind]: on }));
    if (on) fetchNearby(kind);
  };

  const refreshNearby = () => KINDS.filter((k) => shown[k]).forEach((k) => fetchNearby(k));

  const choose = (r: Recommendation) => {
    setPicking(false);
    setDraft({ day_number: 1, start_time: "12:00", ...r });
  };

  const suggest = async () => {
    const b = map.current!.getBounds();
    setRecState("loading");
    try {
      setRecs(await getRecommendations(it, { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }));
      setRecState("idle");
    } catch {
      setRecState("error");
    }
  };

  const add = async (f: StopFields) => {
    if (!(await onAdd(f))) return;
    setRecs((r) => r && { ...r, places: r.places.filter((p) => p.place_name !== draft?.place_name) });
    setDraft(null);
  };

  return (
    <section>
      <h2>{t("map.title")}</h2>
      {editable && <p className="muted">{t("map.hint")}</p>}
      <div ref={box} className={"tripmap" + (editable ? "" : " readonly")} aria-label={t("map.title")} />

      <div className="nearby">
        <h3>{t("near.title")}</h3>
        <p className="muted">{t("near.hint")}</p>
        <div className="kinds">
          {KINDS.map((k) => (
            <button key={k} type="button" className="small" aria-pressed={shown[k]} onClick={() => toggleNearby(k)}>
              <span className={`dot ${k}`} aria-hidden="true" />{t(`near.kinds.${k}`)}
            </button>
          ))}
          {KINDS.some((k) => shown[k]) && (
            <button type="button" className="ghost small" onClick={refreshNearby}>{t("near.refresh")}</button>
          )}
        </div>
        {shown.restrooms && (
          <label className="check">
            <input type="checkbox" checked={accessibleOnly}
              onChange={(e) => { setAccessibleOnly(e.target.checked); fetchNearby("restrooms", e.target.checked); }} />
            {t("near.accessibleOnly")}
          </label>
        )}
        {KINDS.filter((k) => shown[k]).map((k) => (
          <div key={k}>
            <h3>{t(`near.kinds.${k}`)}</h3>
            {nearState[k] === "loading" && <p role="status" className="muted">{t("near.loading")}</p>}
            {nearState[k] === "error" && <p role="alert" className="error">{t("near.failed")}</p>}
            {!nearState[k] && found[k]?.length === 0 && <p className="muted">{t("near.none")}</p>}
            {!nearState[k] && !!found[k]?.length && (
              <ul className="nearby-list">
                {found[k]!.slice(0, 6).map((p) => (
                  <li key={p.key}>
                    {/* the whole entry opens Kakao Map with directions from where the person is to this place */}
                    <a className="nearby-link" href={directionsLink({ name: p.name, lat: p.lat, lng: p.lng }) ?? undefined}
                      target="_blank" rel="noopener noreferrer" aria-label={t("near.directionsTo", { place: p.name })}>
                      {p.image && <img src={p.image} alt="" loading="lazy" />}
                      <div>
                        <strong>{p.name}</strong>
                        {p.details.map((d) => <small key={d}>{d}</small>)}
                        <span className="nearby-go">{t("near.directions")} →</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {KINDS.some((k) => shown[k]) && <p className="muted"><small>{t("near.source")}</small></p>}
      </div>

      {editable && (
        <>
          <div className="rowbtns">
            <button type="button" className="primary" onClick={suggest} disabled={recState === "loading"}>
              {t("map.suggest")}
            </button>
          </div>
          <p role="status" className="muted">{recState === "loading" ? t("map.suggesting") : ""}</p>
          {recState === "error" && <p role="alert" className="error">{t("map.recError")}</p>}

          {recs && recState === "idle" && (
            <>
              <h3>{t("map.recsTitle")}</h3>
              <p className="muted">{t({ ai: "map.recsAi", tourapi: "map.recsTour", osm: "map.recsOsm", sample: "map.recsSample" }[recs.source])}</p>
              {recs.places.length === 0 && <p>{t("map.noRecs")}</p>}
              <ul className="recs">
                {recs.places.map((r) => (
                  <li key={r.place_name} className={draft?.place_name === r.place_name ? "chosen" : ""}>
                    <div><strong>{r.place_name}</strong><p>{r.activity}</p></div>
                    <button type="button" className="ghost small" onClick={() => choose(r)} aria-label={`${t("map.addToSchedule")}: ${r.place_name}`}>
                      + {t("map.addToSchedule")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {draft && (picking ? <p role="status">{t("map.picking")}</p> : (
            <>
              <h3>{t("map.newStop")}</h3>
              <StopForm
                key={`${draft.lat},${draft.lng},${draft.place_name}`}
                initial={draft} days={it.days} submitLabel={t("collab.addSave")} busy={busy}
                onSubmit={add} onCancel={() => setDraft(null)}
              />
            </>
          ))}
        </>
      )}
    </section>
  );
}
