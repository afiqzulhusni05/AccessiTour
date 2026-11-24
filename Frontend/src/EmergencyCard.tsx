import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getEmergencyCard, saveEmergencyCard } from "./api";
import { Loading } from "./Dash";
import type { EmergencyCard as Card, GenderPreference } from "./types";
import { useLoad } from "./useLoad";

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENDER_PREFERENCES: GenderPreference[] = ["any", "female", "male"];

/** "Any / Female / Male" as one row of choices. */
export function GenderPicker({ value, onChange }: { value: GenderPreference; onChange: (g: GenderPreference) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="fieldlabel">{t("card.genderPref")}</legend>
      <div className="chips" role="radiogroup" aria-label={t("card.genderPref")}>
        {GENDER_PREFERENCES.map((g) => (
          <label key={g} className="chip">
            <input type="radio" name="gender-preference" checked={value === g} onChange={() => onChange(g)} />
            <span>{t(`card.gender.${g}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The card's facts, with each label also in Korean so a helper or paramedic in Korea can read it.
 * Shows nothing for fields that were left empty.
 */
export function CardFacts({ card }: { card: Card }) {
  const { t, i18n } = useTranslation();
  const ko = i18n.getFixedT("ko");
  const label = (key: string) => (i18n.language === "ko" ? t(key) : `${t(key)} · ${ko(key)}`);
  return (
    <dl className="facts emergency-facts">
      {card.blood_type && <><dt>{label("card.bloodType")}</dt><dd>{card.blood_type}</dd></>}
      {(card.contact_name || card.contact_phone) && (
        <>
          <dt>{label("card.contact")}</dt>
          <dd>
            {card.contact_name}{card.contact_name && card.contact_phone ? " · " : ""}
            {card.contact_phone && <a href={`tel:${card.contact_phone.replace(/[^\d+]/g, "")}`}>{card.contact_phone}</a>}
          </dd>
        </>
      )}
      {card.medical_notes && <><dt>{label("card.medical")}</dt><dd className="prewrap">{card.medical_notes}</dd></>}
    </dl>
  );
}

export const isEmpty = (c: Card) => !c.blood_type && !c.contact_name && !c.contact_phone && !c.medical_notes;

/** The emergency card on a tourist's My profile: read-only until "Edit", saved to the team API's tourist profile. */
export default function EmergencyCardSection() {
  const { t } = useTranslation();
  const { data: saved, setData: setSaved, failed } = useLoad(getEmergencyCard);
  const [draft, setDraft] = useState<Card | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (changes: Partial<Card>) => { setMsg(null); setDraft({ ...draft!, ...changes }); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (draft.contact_phone && !/^\+?[\d\s()-]{6,30}$/.test(draft.contact_phone.trim())) {
      return setMsg({ ok: false, text: t("card.badPhone") });
    }
    setBusy(true);
    try {
      setSaved(await saveEmergencyCard(draft));
      setDraft(null);
      setMsg({ ok: true, text: t("card.saved") });
    } catch {
      setMsg({ ok: false, text: t("card.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="emergency-card" aria-labelledby="card-title">
      <h2 id="card-title">{t("card.title")}</h2>
      <p className="muted">{t("card.intro")}</p>
      {!saved ? <Loading failed={failed} /> : !draft ? (
        <>
          {isEmpty(saved) ? <p className="notice">{t("card.empty")}</p> : <CardFacts card={saved} />}
          <p role="status">{msg?.text}</p>
          <button type="button" className="ghost" onClick={() => { setMsg(null); setDraft(saved); }}>
            {t(isEmpty(saved) ? "card.fill" : "card.edit")}
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="row">
            <label>{t("card.bloodType")}
              <select value={draft.blood_type} onChange={(e) => set({ blood_type: e.target.value })}>
                <option value="">{t("card.unknown")}</option>
                {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label>{t("card.contactName")}
              <input type="text" maxLength={100} autoComplete="off" value={draft.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            </label>
            <label>{t("card.contactPhone")}
              <input type="tel" maxLength={30} autoComplete="off" placeholder="+60 12 345 6789" value={draft.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
            </label>
          </div>
          <label>{t("card.medical")}
            <textarea maxLength={1000} value={draft.medical_notes} placeholder={t("card.medicalHint")} onChange={(e) => set({ medical_notes: e.target.value })} />
          </label>
          <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : ""}>{msg?.text}</p>
          <div className="rowbtns">
            <button type="submit" className="primary" disabled={busy}>{t("card.save")}</button>
            <button type="button" className="ghost" onClick={() => { setMsg(null); setDraft(null); }}>{t("collab.cancel")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
