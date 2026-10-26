import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { requestBooking } from "../api";
import Breakdown, { pct, Reasons } from "../Breakdown";
import { useLocalized } from "../names";
import { useProfile } from "../ProfileContext";

const days = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;

export default function GuidePage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { id } = useParams();
  const { profile, results } = useProfile();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");

  if (!profile) return <Navigate to="/plan" replace />;
  const r = results?.find((x) => String(x.guide.id) === id);
  if (!r) return <Navigate to="/results" replace />;

  const g = r.guide;
  const name = loc(g.name, g.name_ko);
  const bio = loc(g.bio, g.bio_ko);
  const n = days(profile.start_date, profile.end_date);
  const fee = g.daily_rate * n;
  const book = async () => {
    setState("sending");
    try {
      await requestBooking(profile, g.id);
      navigate("/bookings");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="page wide">
      <Link to="/results" className="backlink">← {t("guide.back")}</Link>

      <div className="guide-top">
        <div>
          <h1>{name}</h1>
          <p className="muted">
            {g.languages.map((l) => t(`lang.${l}`)).join(", ")} · {g.review_count ? `★ ${g.rating.toFixed(1)} (${g.review_count} ${t("results.reviews")})` : t("results.newGuide")}
          </p>
          <p className="price">₩{g.daily_rate.toLocaleString()} <small>{t("results.perDay")}</small></p>
        </div>
        <div className="score">
          <div className="strip" role="img" aria-label={`${t("results.match")} ${pct(r.score)}%`}>
            <span style={{ width: `${pct(r.score)}%` }} />
          </div>
          <strong>{pct(r.score)}%</strong> <span className="muted">{t("results.match")}</span>
        </div>
      </div>

      {r.penalties.includes("no_wheelchair_experience") && <p className="warn">{t("results.noWheelchair")}</p>}
      {bio && <p>{bio}</p>}

      <section>
        <h2>{t("guide.about")}</h2>
        <dl className="facts">
          <dt>{t("trip.region")}</dt>
          <dd>{g.regions.map((x) => t(`region.${x}`)).join(", ")}</dd>
          <dt>{t("needs.interests")}</dt>
          <dd>{g.interests.length ? g.interests.map((x) => t(`interest.${x}`)).join(", ") : "–"}</dd>
          <dt>{t("factor.accessibility")}</dt>
          <dd>
            {g.access_tags.length ? (
              <ul className="tags">
                {g.access_tags.map((tag) => (
                  <li key={tag}>{t(`tag.${tag}`)}{g.verified_tags.includes(tag) ? " ✓" : ""}</li>
                ))}
              </ul>
            ) : t("guide.noTags")}
          </dd>
        </dl>
      </section>

      <section>
        <h2>{t("results.why")}</h2>
        <Reasons result={r} />
        <Breakdown breakdown={r.breakdown} />
        <p className="footnote">{t("results.tagNote")}</p>
      </section>

      <section>
        <h2>{t("guide.trip")}</h2>
        <dl className="facts">
          <dt>{t("guide.dates")}</dt>
          <dd>{profile.start_date} – {profile.end_date} ({t("guide.days", { count: n })})</dd>
          <dt>{t("trip.party")}</dt>
          <dd>{profile.party_size}</dd>
          <dt>{t("guide.fee")}</dt>
          <dd>
            ₩{fee.toLocaleString()}
            {g.daily_rate > profile.budget_per_day && <span className="warn"> {t("guide.overBudget")}</span>}
          </dd>
        </dl>
      </section>

      <div className="cta">
        <p className="muted">{t("guide.chooseHint")}</p>
        <button type="button" className="primary" disabled={state === "sending"} onClick={book}>{t("guide.choose", { name })}</button>
        {state === "failed" && <p role="alert" className="error">{t("booking.requestFailed")}</p>}
      </div>
    </div>
  );
}
