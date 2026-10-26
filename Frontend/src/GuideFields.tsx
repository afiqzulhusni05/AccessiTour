import { useTranslation } from "react-i18next";
import { ACCESS_TAGS, GUIDE_INTERESTS, GUIDE_REGIONS, LANGS, toggle } from "./options";
import MultiSelect from "./MultiSelect";
import type { GuideProfileIn } from "./types";

/** The guide profile form fields, shared by sign-up and "My profile". They follow the team API's guide profile. */
export default function GuideFields({ value: g, onChange: setG, local = false }: {
  value: GuideProfileIn;
  onChange: (g: GuideProfileIn) => void;
  /** An account kept in the local backend: it has no gender field and may already guide outside the team API's regions. */
  local?: boolean;
}) {
  const { t } = useTranslation();

  const chips = (all: string[], key: "regions" | "languages" | "interests" | "access_tags", ns: string) => (
    <div className="chips">
      {all.map((x) => (
        <label key={x} className="chip">
          <input type="checkbox" checked={g[key].includes(x)} onChange={() => setG({ ...g, [key]: toggle(g[key], x) })} />
          <span>{t(`${ns}.${x}`)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <>
      <fieldset>
        <div className="row">
          {!local && (
            <div className="field" role="radiogroup" aria-label={t("auth.gender")}>
              <span>{t("auth.gender")}</span>
              <div className="chips">
                {(["FEMALE", "MALE"] as const).map((x) => (
                  <label key={x} className="chip">
                    <input type="radio" name="guide-gender" checked={g.gender === x} onChange={() => setG({ ...g, gender: x })} />
                    <span>{t(`auth.genders.${x}`)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label>{t("auth.rate")}
            <input type="number" required min={0} step={5000} value={g.daily_rate} onChange={(e) => setG({ ...g, daily_rate: +e.target.value })} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="fieldlabel">{t("auth.cities")}</legend>
        {chips(local ? [...new Set([...GUIDE_REGIONS, ...g.regions])] : GUIDE_REGIONS, "regions", "region")}
      </fieldset>
      <MultiSelect
        label={t("auth.languages")} options={LANGS} value={g.languages}
        onChange={(v) => setG({ ...g, languages: v })} optionLabel={(l) => t(`lang.${l}`)}
      />
      <MultiSelect
        label={t("auth.interests")} options={GUIDE_INTERESTS} value={g.interests}
        onChange={(v) => setG({ ...g, interests: v })} optionLabel={(x) => t(`interest.${x}`)}
      />
      <fieldset>
        <legend className="fieldlabel">{t("auth.access")}</legend>
        {chips(ACCESS_TAGS, "access_tags", "tag")}
        <small className="muted">{t("auth.accessHint")}</small>
      </fieldset>
      <fieldset>
        <label>{t("auth.bio")}
          <textarea maxLength={1000} value={g.bio} onChange={(e) => setG({ ...g, bio: e.target.value })} />
        </label>
      </fieldset>
    </>
  );
}
