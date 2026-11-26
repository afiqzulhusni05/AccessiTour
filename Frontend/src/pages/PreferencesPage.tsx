import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getEmergencyCard, getPreferences, saveEmergencyCard, savePreferences } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import EmergencyCardSection, { GenderPicker, phoneOk } from "../EmergencyCard";
import MultiSelect from "../MultiSelect";
import { DIETARY, LANGS, MOBILITY } from "../options";
import type { EmergencyCard, TripPreferences } from "../types";
import { useLoad } from "../useLoad";
import { AccountCard, EditBar, InfoRow, ProfileCard, ProfileHeader, savePhotoChange, type PhotoChange } from "../ProfileParts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A tourist's profile: photo, the saved accessibility, language and food preferences that start every new trip,
 * and the emergency card (all kept in the team API's tourist profile). Read-only until "Edit profile"; then the
 * whole page is one form with one Save.
 */
export default function PreferencesPage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const prefs = useLoad(getPreferences);
  const card = useLoad(getEmergencyCard);
  const [editing, setEditing] = useState(false);
  const [prefDraft, setPrefDraft] = useState<TripPreferences | null>(null);
  const [cardDraft, setCardDraft] = useState<EmergencyCard | null>(null);
  const [photo, setPhoto] = useState<PhotoChange>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!prefs.data) return <div className="page"><h1>{t("nav.profile")}</h1><Loading failed={prefs.failed} /></div>;
  const saved = prefs.data;
  const p = prefDraft ?? saved;
  const set = (changes: Partial<TripPreferences>) => { setMsg(null); setPrefDraft({ ...p, ...changes }); };
  const tags = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`));

  const start = () => {
    setMsg(null);
    setPrefDraft(saved);
    setCardDraft(card.data ?? null);
    setPhoto(null);
    setEditing(true);
  };
  const stop = () => { setEditing(false); setPrefDraft(null); setCardDraft(null); setPhoto(null); };

  /** Saves only what changed: preferences, emergency card, then the photo (the one most likely to be refused). */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (p.languages.length === 0) return setMsg({ ok: false, text: t("err.language") });
    if (cardDraft && !phoneOk(cardDraft.contact_phone)) return setMsg({ ok: false, text: t("card.badPhone") });
    setBusy(true);
    setMsg(null);
    try {
      if (!same(p, saved)) prefs.setData(await savePreferences(p));
      if (cardDraft && !same(cardDraft, card.data)) card.setData(await saveEmergencyCard(cardDraft));
    } catch {
      setBusy(false);
      return setMsg({ ok: false, text: t("prefs.failed") });
    }
    try {
      await savePhotoChange(photo);
    } catch (err) {
      const why = err instanceof ApiError && (err.status === 404 || err.status === 405) ? t("pcard.photoUnavailable")
        : err instanceof ApiError && err.detail ? err.detail : t("pcard.photoFailed");
      setBusy(false);
      setPhoto(null);
      return setMsg({ ok: false, text: t("pcard.photoNotSaved", { why }) });
    }
    if (photo) await refresh();
    setBusy(false);
    stop();
    setMsg({ ok: true, text: t("pcard.profileSaved") });
  };

  return (
    <form className="page formpage profile" onSubmit={submit}>
      <h1>{t("nav.profile")}</h1>
      <ProfileHeader user={user!} editing={editing} onEdit={start} photo={photo} onPhoto={(ph) => { setMsg(null); setPhoto(ph); }} />
      {!editing && msg && <p role="status" className={"pcard-msg" + (msg.ok ? "" : " error")}>{msg.text}</p>}

      <ProfileCard title={t("prefs.title")}>
        {!editing ? (
          <>
            <p className="muted pcard-intro">{t("prefs.intro")}</p>
            <ul className="infolist">
              <InfoRow icon="mobility" label={t("needs.mobility")} value={(t(`mobility.${p.mobility}`) as unknown as string[])[0]} />
              <InfoRow icon="language" label={t("trip.language")} tags={tags(p.languages, "lang")} />
              <InfoRow icon="food" label={t("needs.dietary")} tags={tags(p.dietary, "diet")} />
              <InfoRow icon="person" label={t("card.genderPref")} value={t(`card.gender.${p.gender_preference ?? "any"}`)} />
            </ul>
          </>
        ) : (
          <>
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
          </>
        )}
      </ProfileCard>

      <EmergencyCardSection
        saved={card.data ?? null} failed={card.failed}
        draft={editing ? cardDraft : null} onChange={(c) => { setMsg(null); setCardDraft(c); }}
        onStart={start}
      />

      {editing ? <EditBar busy={busy} msg={msg} onCancel={() => { setMsg(null); stop(); }} /> : <AccountCard />}
    </form>
  );
}
