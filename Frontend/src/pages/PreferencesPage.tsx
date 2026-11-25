import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getPreferences, savePreferences } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import EmergencyCardSection, { GenderPicker } from "../EmergencyCard";
import MultiSelect from "../MultiSelect";
import { DIETARY, LANGS, MOBILITY } from "../options";
import type { TripPreferences } from "../types";
import { useLoad } from "../useLoad";
import { AccountCard, InfoRow, ProfileCard, ProfileHeader } from "../ProfileParts";

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
  const tags = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`));

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

  const edit = () => { setMsg(null); setDraft(saved); };
  return (
    <div className="page formpage profile">
      <h1>{t("nav.profile")}</h1>
      <ProfileHeader user={user} />

      <ProfileCard title={t("prefs.title")} onEdit={draft ? undefined : edit}>
      {!draft ? (
        <>
          <p className="muted pcard-intro">{t("prefs.intro")}</p>
          <ul className="infolist">
            <InfoRow icon="mobility" label={t("needs.mobility")} value={(t(`mobility.${p.mobility}`) as unknown as string[])[0]} />
            <InfoRow icon="language" label={t("trip.language")} tags={tags(p.languages, "lang")} />
            <InfoRow icon="food" label={t("needs.dietary")} tags={tags(p.dietary, "diet")} />
            <InfoRow icon="person" label={t("card.genderPref")} value={t(`card.gender.${p.gender_preference ?? "any"}`)} />
          </ul>
          {msg && <p role="status" className={"pcard-msg" + (msg.ok ? "" : " error")}>{msg.text}</p>}
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
        <GenderPicker value={p.gender_preference ?? "any"} onChange={(g) => set({ gender_preference: g })} />
        <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : ""}>{msg?.text}</p>
        <div className="rowbtns">
          <button type="submit" className="primary" disabled={busy}>{t("prefs.save")}</button>
          <button type="button" className="ghost" onClick={() => { setMsg(null); setDraft(null); }}>{t("collab.cancel")}</button>
        </div>
      </form>
      )}

      </ProfileCard>

      <EmergencyCardSection />
      <AccountCard />
    </div>
  );
}
