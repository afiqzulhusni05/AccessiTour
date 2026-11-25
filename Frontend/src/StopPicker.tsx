import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRecommendations } from "./api";
import { nextFreeTime } from "./progress";
import { cityById } from "./regions";
import { StopForm } from "./Stop";
import type { Itinerary, Recommendation, StopFields } from "./types";

const AROUND_KM = [1.5, 4]; // look close to the day's stops first, then a little wider

/** Where to look for places: the day's last stop on the map, else the latest earlier one, else the city centre. */
function anchorFor(it: Itinerary, day: number): { lat: number; lng: number } | null {
  const placed = it.items.filter((i) => i.lat !== null && i.lng !== null && i.day_number <= day);
  const sameDay = placed.filter((i) => i.day_number === day);
  const pick = (sameDay.length ? sameDay : placed).at(-1);
  if (pick) return { lat: pick.lat!, lng: pick.lng! };
  const city = cityById(it.trip.region);
  return city ? { lat: city.lat, lng: city.lng } : null;
}

const boxAround = ({ lat, lng }: { lat: number; lng: number }, km: number) => {
  const dLat = km / 111, dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
};

/**
 * "Add a stop" from a day's + menu: places near the day's stops to pick from, added after the day's
 * last stop, like the lunch and dinner picker. Typing a place yourself is still possible.
 */
export default function StopPicker({ itinerary: it, day, busy, onAdd, onCancel }: {
  itinerary: Itinerary;
  day: number;
  busy: boolean;
  onAdd: (f: StopFields) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const time = nextFreeTime(it.items.filter((i) => i.day_number === day));
  const [places, setPlaces] = useState<Recommendation[] | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [wide, setWide] = useState(0); // index into AROUND_KM
  const [typing, setTyping] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const anchor = anchorFor(it, day);
    if (!anchor) { setPlaces([]); setState("idle"); return; }
    let live = true;
    setState("loading");
    getRecommendations(it, boxAround(anchor, AROUND_KM[wide]))
      .then((r) => { if (live) { setPlaces(r.places); setState("idle"); } })
      .catch(() => live && setState("error"));
    return () => { live = false; };
    // searched once per opening (and when widened); new stops elsewhere shouldn't restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, wide, attempt]);

  if (typing) {
    return (
      <StopForm
        initial={{ day_number: day, start_time: time, place_name: "", activity: "" }}
        days={it.days} submitLabel={t("collab.addSave")} busy={busy} fixedSlot
        onSubmit={onAdd} onCancel={() => setTyping(false)}
      />
    );
  }

  return (
    <div className="mealpicker">
      <h3>{t("addstop.title", { n: day })}</h3>
      <p className="muted">{t("addstop.hint", { time })}</p>
      <p role="status" className="muted">{state === "loading" ? t("addstop.finding") : ""}</p>
      {state === "error" && <p role="alert" className="error">{t("addstop.failed")}</p>}
      {state === "idle" && places && (places.length === 0 ? (
        <p>{t("addstop.none")}</p>
      ) : (
        <ul className="recs">
          {places.map((r) => (
            <li key={r.place_name}>
              <div><strong>{r.place_name}</strong><p>{r.activity}</p></div>
              <button
                type="button" className="ghost small" disabled={busy} aria-label={`${t("meal.add", { time })}: ${r.place_name}`}
                onClick={() => onAdd({ ...r, day_number: day, start_time: time })}
              >+ {t("meal.add", { time })}</button>
            </li>
          ))}
        </ul>
      ))}
      <div className="rowbtns">
        {state !== "loading" && wide < AROUND_KM.length - 1 && (
          <button type="button" className="ghost" onClick={() => setWide(wide + 1)}>{t("addstop.wider")}</button>
        )}
        {state === "error" && <button type="button" className="ghost" onClick={() => setAttempt(attempt + 1)}>{t("results.retry")}</button>}
        <button type="button" className="ghost" onClick={() => setTyping(true)}>{t("addstop.type")}</button>
        <button type="button" className="ghost" onClick={onCancel}>{t("collab.cancel")}</button>
      </div>
      <p className="muted"><small>{t("addstop.source")}</small></p>
    </div>
  );
}
