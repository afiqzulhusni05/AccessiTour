import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getGuideProfile, saveGuideProfile } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import GuideFields from "../GuideFields";
import type { GuideProfileIn } from "../types";
import { useLoad } from "../useLoad";

const EMPTY: GuideProfileIn = {
  gender: "FEMALE", bio: "", regions: [], languages: ["ko"], daily_rate: 100000, interests: [], access_tags: [],
};

/** The profile travellers are matched on. Read-only until the guide presses "Edit profile". */
export default function GuideProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, setData, failed } = useLoad(async () => {
    const mine = await getGuideProfile();
    return { profile: mine as GuideProfileIn | null, verified: mine?.verified ?? false };
  });
  const [edits, setEdits] = useState<GuideProfileIn | null>(null); // non-null while editing
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return (
      <div className="page">
        <h1>{t("gprofile.title")}</h1>
        {failed ? <p role="alert" className="error">{t("gprofile.loadFailed")}</p> : <Loading failed={false} />}
      </div>
    );
  }
  const saved = data.profile;
  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!edits) return;
    if (edits.regions.length === 0 || edits.languages.length === 0) return setMsg({ ok: false, text: t("gprofile.failed") });
    setBusy(true);
    setMsg(null);
    try {
      await saveGuideProfile(edits);
      setData({ ...data, profile: edits });
      setEdits(null);
      setMsg({ ok: true, text: t("gprofile.saved") });
    } catch {
      setMsg({ ok: false, text: t("gprofile.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page formpage">
      <h1>{t("gprofile.title")}</h1>

      {!edits ? (
        <>
          {saved ? (
            <dl className="facts">
              <dt>{t("auth.nameGuide")}</dt><dd>{user!.display_name}</dd>
              <dt>{t("auth.email")}</dt><dd>{user!.email}</dd>
              <dt>{t("auth.gender")}</dt><dd>{t(`auth.genders.${saved.gender}`)}</dd>
              <dt>{t("auth.cities")}</dt><dd>{list(saved.regions, "region")}</dd>
              <dt>{t("dash.languages")}</dt><dd>{list(saved.languages, "lang")}</dd>
              <dt>{t("dash.rate")}</dt><dd>₩{saved.daily_rate.toLocaleString()}</dd>
              <dt>{t("dash.specialities")}</dt><dd>{list(saved.interests, "interest")}</dd>
              <dt>{t("factor.accessibility")}</dt><dd>{list(saved.access_tags, "tag")}{data.verified && saved.access_tags.length > 0 ? " ✓" : ""}</dd>
              <dt>{t("auth.bio")}</dt><dd>{saved.bio || "–"}</dd>
            </dl>
          ) : <p className="notice check">{t("gprofile.missing")}</p>}
          <p role="status">{msg?.text}</p>
          <button type="button" className="primary" onClick={() => { setMsg(null); setEdits(saved ?? EMPTY); }}>
            {t(saved ? "dash.editProfile" : "gprofile.create")}
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <GuideFields value={edits} onChange={(next) => { setMsg(null); setEdits(next); }} />
          <p role={msg && !msg.ok ? "alert" : "status"} className={msg && !msg.ok ? "error" : "muted"}>{busy ? t("auth.waking") : msg?.text}</p>
          <div className="rowbtns">
            <button type="submit" className="primary" disabled={busy}>{t("gprofile.save")}</button>
            <button type="button" className="ghost" onClick={() => { setMsg(null); setEdits(null); }}>{t("collab.cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
