import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getGuideProfile, saveGuideProfile } from "../api";
import { useAuth } from "../AuthContext";
import { Loading } from "../Dash";
import { AccountCard, EditBar, InfoRow, ProfileCard, ProfileHeader, savePhotoChange, type PhotoChange } from "../ProfileParts";
import GuideFields from "../GuideFields";
import type { GuideProfileIn } from "../types";
import { useLoad } from "../useLoad";

const EMPTY: GuideProfileIn = {
  gender: "FEMALE", bio: "", regions: [], languages: ["ko"], daily_rate: 100000, interests: [], access_tags: [],
};

/** The profile travellers are matched on, with the guide's photo. Read-only until "Edit profile"; then one form with one Save. */
export default function GuideProfilePage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const { data, setData, failed } = useLoad(async () => {
    const mine = await getGuideProfile();
    return { profile: mine as GuideProfileIn | null, verified: mine?.verified ?? false };
  });
  const [edits, setEdits] = useState<GuideProfileIn | null>(null); // non-null while editing
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<PhotoChange>(null);
  const editing = edits !== null;

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

  const start = () => { setMsg(null); setPhoto(null); setEdits(saved ?? EMPTY); };
  const stop = () => { setEdits(null); setPhoto(null); };

  /** Saves the guide details (when changed), then the photo (the one most likely to be refused). */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!edits) return;
    if (edits.regions.length === 0 || edits.languages.length === 0) return setMsg({ ok: false, text: t("gprofile.failed") });
    setBusy(true);
    setMsg(null);
    try {
      if (JSON.stringify(edits) !== JSON.stringify(saved)) {
        await saveGuideProfile(edits);
        setData({ ...data, profile: edits });
      }
    } catch {
      setBusy(false);
      return setMsg({ ok: false, text: t("gprofile.failed") });
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
      <h1>{t("gprofile.title")}</h1>
      <ProfileHeader
        user={user!} badge={data.verified ? <span className="pill ok">✓ {t("pcard.verified")}</span> : undefined}
        editing={editing} onEdit={start} photo={photo} onPhoto={(ph) => { setMsg(null); setPhoto(ph); }}
      />
      {!editing && msg && <p role="status" className={"pcard-msg" + (msg.ok ? "" : " error")}>{msg.text}</p>}

      <ProfileCard title={t("pcard.guideDetails")}>
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
              <button type="button" className="primary" onClick={start}>{t("gprofile.create")}</button>
            </>
          )}
        </>
      ) : (
        <GuideFields value={edits} onChange={(next) => { setMsg(null); setEdits(next); }} />
      )}
      </ProfileCard>
      {editing ? <EditBar busy={busy} msg={msg} onCancel={() => { setMsg(null); stop(); }} /> : <AccountCard />}
    </form>
  );
}
