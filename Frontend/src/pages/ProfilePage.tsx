import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPlan, getPreferences } from "../api";
import { checkLegs, MAX_LEGS, moveLeg, stayDays } from "../multiCity";
import MultiSelect from "../MultiSelect";
import { useProfile } from "../ProfileContext";
import { CITIES, PROVINCES } from "../regions";
import { DIETARY, INTERESTS, LANGS, MOBILITY } from "../options";
import type { TouristProfile, TripLeg } from "../types";


// Local calendar date, not UTC: toISOString() would give yesterday before 09:00 in Korea.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const defaults = (): TouristProfile => ({
  region: "seoul", start_date: "", end_date: "", party_size: 1, // dates are left for the traveller to pick
  languages: ["en"], budget_per_day: 120000, mobility: "normal",
  interests: [], dietary: [], religious: [], notes: "",
});


export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { profile, setProfile } = useProfile();
  const [p, setP] = useState<TouristProfile>(profile ?? defaults());
  // The cities, in visiting order. With one city its dates are simply the trip's dates.
  const [legs, setLegs] = useState<TripLeg[]>([{ region: (profile ?? defaults()).region, start_date: "", end_date: "" }]);
  const [cityText, setCityText] = useState("");
  const [adding, setAdding] = useState(false); // the city search box is open
  const [busy, setBusy] = useState(false);
  const multi = legs.length > 1;
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const touched = useRef(false);
  const set = <K extends keyof TouristProfile>(k: K, v: TouristProfile[K]) => {
    touched.current = true;
    setP((prev) => ({ ...prev, [k]: v }));
  };

  // A new trip starts from the saved preferences, unless the traveller has already begun typing.
  useEffect(() => {
    if (profile) return;
    let live = true;
    getPreferences()
      // the number of travellers belongs to each trip, not to the saved profile
      .then(({ party_size: _, ...prefs }) => live && !touched.current && setP((prev) => ({ ...prev, ...prefs })))
      .catch(() => {});
    return () => { live = false; };
  }, [profile]);
  const steps = t("steps") as unknown as string[];

  const setLeg = (i: number, changes: Partial<TripLeg>) => {
    touched.current = true;
    setErr("");
    setLegs((prev) => prev.map((leg, n) => (n === i ? { ...leg, ...changes } : leg)));
  };
  /** Adds the city typed into the search box, matching its English or Korean name. */
  const addCity = () => {
    const typed = cityText.trim().toLowerCase();
    if (!typed) return;
    const city = CITIES.find((c) => c.en.toLowerCase() === typed || c.ko === typed)
      ?? CITIES.filter((c) => c.en.toLowerCase().startsWith(typed) || c.ko.startsWith(typed)).find((_, __, all) => all.length === 1);
    if (!city) return setErr(t("multi.unknownCity"));
    if (legs.some((leg) => leg.region === city.id)) return setErr(t("multi.duplicate", { city: t(`region.${city.id}`) }));
    if (legs.length >= MAX_LEGS) return setErr(t("multi.tooMany", { max: MAX_LEGS }));
    touched.current = true;
    setErr("");
    setCityText("");
    setAdding(false);
    // going from one city to two: the first city takes over the trip's dates as a starting point
    setLegs((prev) => [
      ...(prev.length === 1 ? [{ ...prev[0], start_date: p.start_date, end_date: "" }] : prev),
      { region: city.id, start_date: "", end_date: prev.length === 1 ? p.end_date : "" },
    ]);
  };

  const next = () => {
    if (step === 0) {
      if (!p.start_date || !p.end_date) return setErr(t("err.noDates"));
      if (p.end_date < p.start_date) return setErr(t("err.dates"));
      const bad = multi ? checkLegs(legs, p.start_date, p.end_date) : null;
      if (bad) return setErr(t(`multi.err.${bad[1]}`, { city: t(`region.${legs[bad[0]].region}`), prev: bad[0] ? t(`region.${legs[bad[0] - 1].region}`) : "" }));
      if (!(p.budget_per_day > 0)) return setErr(t("err.budget"));
      if (p.languages.length === 0) return setErr(t("err.language"));
    }
    setErr("");
    setStep(step + 1);
  };
  const submit = async () => {
    if (!multi) {
      setProfile({ ...p, region: legs[0].region, plan_id: null });
      return nav("/results");
    }
    // Several cities: save the outline, then each city gets its own guide and itinerary from the trip page.
    setBusy(true);
    setErr("");
    try {
      const { languages, mobility, interests, dietary, budget_per_day, party_size } = p;
      const plan = await createPlan(legs, { languages, mobility, interests, dietary, budget_per_day, party_size });
      nav(`/plans/${plan.id}`);
    } catch {
      setErr(t("multi.saveFailed"));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <ol className="steps" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : i < step ? "done" : ""}>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset>
          <legend>{t("trip.title")}</legend>
          <div className="row">
            <label>{t("trip.start")}
              <input type="date" value={p.start_date} min={inDays(0)} onChange={(e) => set("start_date", e.target.value)} />
            </label>
            <label>{t("trip.end")}
              <input type="date" value={p.end_date} min={p.start_date || inDays(0)} onChange={(e) => set("end_date", e.target.value)} />
            </label>
          </div>

          <div className="field">
            <span id="cities-label">{t("multi.cities")}</span>
            <ol className={"legs" + (multi ? "" : " single")} aria-labelledby="cities-label">
              {legs.map((leg, i) => (
                <li key={i}>
                  <div className="leghead">
                    {multi && <span className="legno" aria-hidden="true">{i + 1}</span>}
                    <select value={leg.region} aria-label={multi ? t("multi.cityN", { n: i + 1 }) : t("trip.region")} onChange={(e) => setLeg(i, { region: e.target.value })}>
                      {PROVINCES.map((prov) => (
                        <optgroup key={prov.en} label={i18n.language === "ko" ? prov.ko : prov.en}>
                          {prov.cities.filter((c) => c.id === leg.region || !legs.some((x) => x.region === c.id))
                            .map((c) => <option key={c.id} value={c.id}>{t(`region.${c.id}`)}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {multi && stayDays(leg) > 0 && <span className="muted">{t("guide.days", { count: stayDays(leg) })}</span>}
                    {multi && (
                      <span className="legbtns">
                        <button type="button" className="ghost iconbtn" disabled={i === 0} onClick={() => setLegs(moveLeg(legs, i, -1))}
                          aria-label={t("multi.earlier", { city: t(`region.${leg.region}`) })} title={t("multi.earlier", { city: t(`region.${leg.region}`) })}>↑</button>
                        <button type="button" className="ghost iconbtn" disabled={i === legs.length - 1} onClick={() => setLegs(moveLeg(legs, i, 1))}
                          aria-label={t("multi.later", { city: t(`region.${leg.region}`) })} title={t("multi.later", { city: t(`region.${leg.region}`) })}>↓</button>
                        <button type="button" className="ghost iconbtn" onClick={() => { setErr(""); setLegs(legs.filter((_, n) => n !== i)); }}
                          aria-label={t("multi.remove", { city: t(`region.${leg.region}`) })} title={t("multi.remove", { city: t(`region.${leg.region}`) })}>×</button>
                      </span>
                    )}
                  </div>
                  {multi && (
                    <div className="row">
                      <label>{t("multi.arrive")}
                        <input type="date" value={leg.start_date} min={p.start_date || inDays(0)} max={p.end_date || undefined} onChange={(e) => setLeg(i, { start_date: e.target.value })} />
                      </label>
                      <label>{t("multi.leave")}
                        <input type="date" value={leg.end_date} min={leg.start_date || p.start_date || inDays(0)} max={p.end_date || undefined} onChange={(e) => setLeg(i, { end_date: e.target.value })} />
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {legs.length < MAX_LEGS && !adding && (
              <div><button type="button" className="textlink" onClick={() => setAdding(true)}>+ {t("multi.addAnother")}</button></div>
            )}
            {legs.length < MAX_LEGS && adding && (
              <div className="cityadd">
                <label>{t("multi.addAnother")}
                  <input
                    autoFocus type="text" list="city-names" value={cityText} placeholder={t("multi.typeCity")}
                    onChange={(e) => setCityText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
                  />
                </label>
                <datalist id="city-names">
                  {CITIES.filter((c) => !legs.some((leg) => leg.region === c.id)).map((c) => <option key={c.id} value={t(`region.${c.id}`)} />)}
                </datalist>
                <button type="button" className="primary" onClick={addCity} disabled={!cityText.trim()}>{t("multi.add")}</button>
                <button type="button" className="ghost" onClick={() => { setAdding(false); setCityText(""); setErr(""); }}>{t("collab.cancel")}</button>
              </div>
            )}
          </div>
          <div className="row">
            <label>{t("trip.party")}
              <input type="number" min={1} value={p.party_size} onChange={(e) => set("party_size", Math.max(1, +e.target.value))} />
            </label>
            <label>{t("trip.budget")}
              <input type="number" min={10000} step={10000} value={p.budget_per_day} onChange={(e) => set("budget_per_day", +e.target.value)} />
            </label>
          </div>
        </fieldset>
      )}
      {step === 0 && (
        <MultiSelect
          label={t("trip.language")} options={LANGS} value={p.languages}
          onChange={(v) => set("languages", v)} optionLabel={(l) => t(`lang.${l}`)}
        />
      )}

      {step === 1 && (
        <>
          <fieldset>
            <legend>{t("needs.mobility")}</legend>
            <div className="optgrid">
            {MOBILITY.map((m) => {
              const [name, desc] = t(`mobility.${m}`) as unknown as string[];
              return (
                <label key={m} className={"option" + (p.mobility === m ? " picked" : "")}>
                  <input type="radio" name="mobility" checked={p.mobility === m} onChange={() => set("mobility", m)} />
                  <span><strong>{name}</strong><small>{desc}</small></span>
                </label>
              );
            })}
            </div>
          </fieldset>
          <MultiSelect
            label={t("needs.interests")} options={INTERESTS} value={p.interests}
            onChange={(v) => set("interests", v)} optionLabel={(i) => t(`interest.${i}`)}
          />
          <MultiSelect
            label={t("needs.dietary")} options={DIETARY} value={p.dietary}
            onChange={(v) => set("dietary", v)} optionLabel={(d) => t(`diet.${d}`)}
          />
        </>
      )}

      {step === 2 && (
        <section>
          <h1>{t("review.title")}</h1>
          <dl className="facts">
            <dt>{t("multi.cities")}</dt>
            <dd>
              {multi
                ? <ol className="plain">{legs.map((leg) => <li key={leg.region}>{t(`region.${leg.region}`)}: {leg.start_date} → {leg.end_date} ({t("guide.days", { count: stayDays(leg) })})</li>)}</ol>
                : t(`region.${legs[0].region}`)}
            </dd>
            <dt>{t("trip.start")}</dt><dd>{p.start_date} → {p.end_date}</dd>
            <dt>{t("trip.party")}</dt><dd>{p.party_size}</dd>
            <dt>{t("trip.budget")}</dt><dd>₩{p.budget_per_day.toLocaleString()}</dd>
            <dt>{t("trip.language")}</dt><dd>{p.languages.map((l) => t(`lang.${l}`)).join(", ")}</dd>
            <dt>{t("needs.mobility")}</dt><dd>{(t(`mobility.${p.mobility}`) as unknown as string[])[0]}</dd>
            <dt>{t("needs.interests")}</dt><dd>{p.interests.map((i) => t(`interest.${i}`)).join(", ") || "–"}</dd>
            <dt>{t("needs.dietary")}</dt><dd>{p.dietary.map((d) => t(`diet.${d}`)).join(", ") || "–"}</dd>
          </dl>
        </section>
      )}

      {err && <p role="alert" className="error">{err}</p>}
      <div className="actions">
        {step > 0 && <button type="button" className="ghost" onClick={() => setStep(step - 1)}>{t("back")}</button>}
        {step < 2 ? (
          <button type="button" className="primary" onClick={next}>{t("next")}</button>
        ) : (
          <button type="button" className="primary" onClick={submit} disabled={busy}>{t(multi ? "multi.create" : "find")}</button>
        )}
      </div>
    </div>
  );
}
