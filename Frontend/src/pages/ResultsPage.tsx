import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { matchGuides } from "../api";
import Breakdown, { isSampleGuide, pct, Reasons } from "../Breakdown";
import { useLocalized } from "../names";
import { useProfile } from "../ProfileContext";

export default function ResultsPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { profile, results, setResults } = useProfile();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<"match" | "price" | "rating">("match");
  const [inBudget, setInBudget] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // Filtering and sorting only rearrange what the matcher returned; the scores themselves come from the server.
  const shown = useMemo(() => {
    if (!results || !profile) return null;
    const list = results.filter((r) =>
      (!inBudget || r.guide.daily_rate <= profile.budget_per_day) && (!hasAccess || r.guide.access_tags.length > 0));
    if (sort === "price") list.sort((a, b) => a.guide.daily_rate - b.guide.daily_rate);
    if (sort === "rating") list.sort((a, b) => (b.guide.review_count ? b.guide.rating : 0) - (a.guide.review_count ? a.guide.rating : 0));
    return list;
  }, [results, profile, sort, inBudget, hasAccess]);

  useEffect(() => {
    if (!profile || results) return;
    const ctrl = new AbortController();
    setFailed(false);
    matchGuides(profile, ctrl.signal)
      .then(setResults)
      .catch((e) => e.name !== "AbortError" && setFailed(true));
    return () => ctrl.abort();
  }, [profile, results, setResults, attempt]);

  if (!profile) return <Navigate to="/plan" replace />;

  return (
    <div className="page wide">
      <div className="head">
        <h1>{t("results.title")}{profile.plan_id ? `: ${t(`region.${profile.region}`)}` : ""}</h1>
        {profile.plan_id
          ? <Link to={`/plans/${profile.plan_id}`} className="ghost btn">{t("multi.backToTrip", { city: t(`region.${profile.region}`) })}</Link>
          : <Link to="/plan" className="ghost btn">{t("results.edit")}</Link>}
      </div>

      {!results && !failed && <p role="status">{t("results.loading")}</p>}
      {!results && failed && (
        <div role="alert" className="error">
          <p>{t("results.error")}</p>
          <button type="button" className="primary" onClick={() => setAttempt((a) => a + 1)}>{t("results.retry")}</button>
        </div>
      )}
      {results && results.length === 0 && <p>{t("results.empty")}</p>}

      {results && results.length > 0 && shown && (
        <>
          <div className="resultbar">
            <label>{t("results.sort")}
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="match">{t("results.sortMatch")}</option>
                <option value="price">{t("results.sortPrice")}</option>
                <option value="rating">{t("results.sortRating")}</option>
              </select>
            </label>
            <div className="chips">
              <label className="chip"><input type="checkbox" checked={inBudget} onChange={(e) => setInBudget(e.target.checked)} /><span>{t("results.inBudget")}</span></label>
              <label className="chip"><input type="checkbox" checked={hasAccess} onChange={(e) => setHasAccess(e.target.checked)} /><span>{t("results.hasAccess")}</span></label>
            </div>
            <p className="muted" role="status">{t("results.count", { count: shown.length })}</p>
          </div>
          {shown.length === 0 && <p>{t("results.noneFiltered")}</p>}
        </>
      )}

      {shown && (
        <ol className="guides">
          {shown.map((r) => (
            <li key={r.guide.id}>
              <div className="who">
                {/* The link's ::after covers the whole card, so the card is one click target. */}
                <h2>
                  <Link to={`/guides/${r.guide.id}`}>{loc(r.guide.name, r.guide.name_ko)}</Link>
                  {isSampleGuide(r.guide.id) && <span className="sampletag">{t("results.sample")}</span>}
                </h2>
                <p className="muted">
                  {r.guide.languages.map((l) => t(`lang.${l}`)).join(", ")} · {r.guide.review_count ? `★ ${r.guide.rating.toFixed(1)} (${r.guide.review_count} ${t("results.reviews")})` : t("results.newGuide")}
                </p>
                <p className="price">₩{r.guide.daily_rate.toLocaleString()} <small>{t("results.perDay")}</small></p>
                {r.guide.access_tags.length > 0 && (
                  <ul className="tags">
                    {r.guide.access_tags.map((tag) => (
                      <li key={tag}>{t(`tag.${tag}`)}{r.guide.verified_tags.includes(tag) ? " ✓" : ""}</li>
                    ))}
                  </ul>
                )}
                {r.penalties.includes("no_wheelchair_experience") && <p className="warn">{t("results.noWheelchair")}</p>}
                <Reasons result={r} />
                <p className="more" aria-hidden="true">{t("results.view")} →</p>
              </div>
              <div className="score">
                <div className="strip" role="img" aria-label={`${t("results.match")} ${pct(r.score)}%`}>
                  <span style={{ width: `${pct(r.score)}%` }} />
                </div>
                <strong>{pct(r.score)}%</strong>
                <details>
                  <summary>{t("results.why")}</summary>
                  <Breakdown breakdown={r.breakdown} />
                </details>
              </div>
            </li>
          ))}
        </ol>
      )}
      {shown && shown.length > 0 && (
        <p className="footnote">
          {t("results.tagNote")}{shown.some((r) => isSampleGuide(r.guide.id)) ? " " + t("results.sampleNote") : ""}
        </p>
      )}
    </div>
  );
}
