import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getPreferences, savePreferences } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import MultiSelect from "../MultiSelect";
import { DIETARY, LANGS, MOBILITY } from "../options";
import type { TripPreferences } from "../types";
import { useLoad } from "../useLoad";

/**
 * A tourist's profile: account details plus the saved accessibility, language and food preferences that
 * start every new trip (kept in the team API's tourist profile). Read-only until "Edit profile" is pressed.
 */
export default function PreferencesPage() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const { data: saved, setData: setSaved, failed } = useLoad(getPreferences);
  const [draft, setDraft] = useState<TripPreferences | null>(null); // non-null while editing
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!saved) return <div className="page"><h1>{t("nav.profile")}</h1><Loading failed={failed} /></div>;
  const p = draft ?? saved;
  const set = (changes: Partial<TripPreferences>) => { setMsg(null); setDraft({ ...p, ...changes }); };
  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (p.languages.length === 0) return setMsg({ ok: false, text: t("err.language") });
    setBusy(true);
    try {
      setSaved(await savePreferences(p));
      setDraft(null);
      setMsg({ ok: true, text: t("prefs.saved") });
    } catch {
      setMsg({ ok: false, text: t("prefs.failed") });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="page formpage">
      <h1>{t("nav.profile")}</h1>
      {(
        <dl className="facts">
          <dt>{t("auth.name")}</dt><dd>{user.display_name}</dd>
          <dt>{t("auth.email")}</dt><dd>{user.email}</dd>
        </dl>
      )}
      <h2>{t("prefs.title")}</h2>

      {!draft ? (
        <>
          <dl className="facts">
            <dt>{t("needs.mobility")}</dt><dd>{(t(`mobility.${p.mobility}`) as unknown as string[])[0]}</dd>
            <dt>{t("trip.language")}</dt><dd>{list(p.languages, "lang")}</dd>
            <dt>{t("needs.dietary")}</dt><dd>{list(p.dietary, "diet")}</dd>
          </dl>
          <p role="status">{msg?.text}</p>
          <button type="button" className="primary" onClick={() => { setMsg(null); setDraft(saved); }}>{t("dash.editProfile")}</button>
        </>
      ) : (
      <form onSubmit={submit}>
        <fieldset>
          <legend>{t("needs.mobility")}</legend>
          <div className="optgrid">
          {MOBILITY.map((m) => {
            const [name, desc] = t(`mobility.${m}`) as unknown as string[];
            return (
              <label key={m} className={"option" + (p.mobility === m ? " picked" : "")}>
                <input type="radio" name="mobility" checked={p.mobility === m} onChange={() => set({ mobility: m })} />
                <span><strong>{name}</strong><small>{desc}</small></span>
              </label>
            );
          })}
          </div>
        </fieldset>
        <MultiSelect
          label={t("trip.language")} options={LANGS} value={p.languages}
          onChange={(v) => set({ languages: v })} optionLabel={(l) => t(`lang.${l}`)}
        />
        <MultiSelect
          label={t("needs.dietary")} options={DIETARY} value={p.dietary}
          onChange={(v) => set({ dietary: v })} optionLabel={(x) => t(`diet.${x}`)}
        />
        <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : ""}>{msg?.text}</p>
        <div className="rowbtns">
          <button type="submit" className="primary" disabled={busy}>{t("prefs.save")}</button>
          <button type="button" className="ghost" onClick={() => { setMsg(null); setDraft(null); }}>{t("collab.cancel")}</button>
        </div>
      </form>
      )}
    </div>
  );
}
