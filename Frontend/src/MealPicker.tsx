import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getMealOptions } from "./api";
import { cityById } from "./regions";
import type { Cuisine, Itinerary, Meal, MealDiet, MealOptions, StopFields } from "./types";

const CUISINES: Cuisine[] = ["korean", "chinese", "japanese", "western", "seafood"];
const DIETS: MealDiet[] = ["halal", "vegetarian", "vegan"];
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Pick a restaurant for lunch or dinner on one day; it is added at a time that fits between the other stops. */
export default function MealPicker({ itinerary: it, day, meal, busy, onAdd, onCancel }: {
  itinerary: Itinerary;
  day: number;
  meal: Meal;
  busy: boolean;
  onAdd: (f: StopFields) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  // start from the food needs in the trip profile
  const [diets, setDiets] = useState<MealDiet[]>(DIETS.filter((d) => it.trip.dietary.includes(d)));
  const [options, setOptions] = useState<MealOptions | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const find = async () => {
    setState("loading");
    try {
      setOptions(await getMealOptions(it, day, meal, cuisines, diets, cityById(it.trip.region)));
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mealpicker">
      <h3>{t("meal.title", { meal: t(`meal.${meal}`), n: day })}</h3>
      <p className="muted">{t("meal.hint")}</p>

      <fieldset>
        <legend className="fieldlabel">{t("meal.cuisine")}</legend>
        <div className="chips">
          {CUISINES.map((c) => (
            <label key={c} className="chip">
              <input type="checkbox" checked={cuisines.includes(c)} onChange={() => setCuisines(toggle(cuisines, c))} />
              <span>{t(`meal.cuisines.${c}`)}</span>
            </label>
          ))}
        </div>
        <small className="muted">{t("meal.cuisineHint")}</small>
      </fieldset>
      <fieldset>
        <legend className="fieldlabel">{t("meal.diet")}</legend>
        <div className="chips">
          {DIETS.map((d) => (
            <label key={d} className="chip">
              <input type="checkbox" checked={diets.includes(d)} onChange={() => setDiets(toggle(diets, d))} />
              <span>{t(`diet.${d}`)}</span>
            </label>
          ))}
        </div>
        <small className="muted">{t("meal.dietHint")}</small>
      </fieldset>

      <div className="rowbtns">
        <button type="button" className="primary" onClick={find} disabled={state === "loading"}>{t("meal.find")}</button>
        <button type="button" className="ghost" onClick={onCancel}>{t("collab.cancel")}</button>
      </div>
      <p role="status" className="muted">{state === "loading" ? t("meal.finding") : ""}</p>
      {state === "error" && <p role="alert" className="error">{t("meal.failed")}</p>}

      {options && state === "idle" && (
        options.places.length === 0 ? (
          <p>{t(options.source === "none" ? "meal.failed" : "meal.none")}</p>
        ) : (
          <>
            <p><strong>{t("meal.fitsAt", { time: options.start_time })}</strong></p>
            <p className="muted">{t(options.source === "ai" ? "meal.ai" : "meal.osm")}</p>
            <ul className="recs">
              {options.places.map((r) => (
                <li key={r.place_name}>
                  <div><strong>{r.place_name}</strong><p>{r.activity}</p></div>
                  <button
                    type="button" className="ghost small" disabled={busy} aria-label={`${t("meal.add", { time: options.start_time })}: ${r.place_name}`}
                    onClick={() => onAdd({ ...r, day_number: day, start_time: options.start_time, meal })}
                  >
                    + {t("meal.add", { time: options.start_time })}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  );
}
