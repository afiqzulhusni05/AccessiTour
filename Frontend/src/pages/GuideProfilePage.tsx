import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getGuideProfile, saveGuideProfile } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import { AccountCard, InfoRow, ProfileCard, ProfileHeader } from "../ProfileParts";
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
  const tags = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`));

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
    <div className="page formpage profile">
      <h1>{t("gprofile.title")}</h1>
      <ProfileHeader user={user!} badge={data.verified ? <span className="pill ok">✓ {t("pcard.verified")}</span> : undefined} />

      <ProfileCard title={t("pcard.guideDetails")} onEdit={edits || !saved ? undefined : () => { setMsg(null); setEdits(saved); }}>
      {!edits ? (
        <>
          {saved ? (
            <>
              <p className="muted pcard-intro">{t("gprofile.intro")}</p>
              <ul className="infolist">
                <InfoRow icon="pin" label={t("auth.cities")} tags={tags(saved.regions, "region")} />
                <InfoRow icon="language" label={t("dash.languages")} tags={tags(saved.languages, "lang")} />
                <InfoRow icon="money" label={t("dash.rate")} value={`₩${saved.daily_rate.toLocaleString()}`} />
                <InfoRow icon="star" label={t("dash.specialities")} tags={tags(saved.interests, "interest")} />
                <InfoRow icon="access" label={t("factor.accessibility")} tags={tags(saved.access_tags, "tag").map((x) => (data.verified ? `${x} ✓` : x))} />
                <InfoRow icon="person" label={t("auth.gender")} value={t(`auth.genders.${saved.gender}`)} />
                <InfoRow icon="note" label={t("auth.bio")} value={saved.bio ? <span className="prewrap">{saved.bio}</span> : ""} />
              </ul>
            </>
          ) : (
            <>
              <p className="notice check">{t("gprofile.missing")}</p>
              <button type="button" className="primary" onClick={() => { setMsg(null); setEdits(EMPTY); }}>{t("gprofile.create")}</button>
            </>
          )}
          {msg && <p role="status" className={"pcard-msg" + (msg.ok ? "" : " error")}>{msg.text}</p>}
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
      </ProfileCard>
      <AccountCard />
    </div>
  );
}
