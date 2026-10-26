import { useTranslation } from "react-i18next";
import type { MatchResult } from "./types";

export const pct = (x: number) => Math.round(x * 100);

/** Sample guides come with the app (ids below this); anything they list is demonstration data. */
export const isSampleGuide = (id: number) => id < 1000;

/**
 * The match in plain words: one line per factor, built only from what the guide's profile says.
 * Each line starts with a text mark, so a good or weak point never depends on colour.
 */
export function Reasons({ result: r }: { result: MatchResult }) {
  const { t } = useTranslation();
  const b = r.breakdown;
  const g = r.guide;
  const lines: [boolean, string][] = [];
  if (b.language !== undefined) lines.push([b.language === 1, t(b.language === 1 ? "reason.language" : "reason.languageFallback")]);
  if (b.availability !== undefined) lines.push([b.availability === 1, t(b.availability === 1 ? "reason.dates" : "reason.datesPart", { pct: pct(b.availability) })]);
  if (b.price !== undefined) lines.push([b.price === 1, t(b.price === 1 ? "reason.price" : "reason.priceOver")]);
  if (b.accessibility !== undefined) {
    const verified = g.verified_tags.length > 0;
    lines.push([b.accessibility > 0, t(b.accessibility === 0 ? "reason.accessNone" : verified ? "reason.accessVerified" : "reason.accessListed")]);
  }
  if (b.interests !== undefined) lines.push([b.interests > 0, t(b.interests > 0 ? "reason.interests" : "reason.interestsNone")]);
  lines.push([g.review_count > 0, g.review_count > 0
    ? t("reason.rating", { rating: g.rating.toFixed(1), count: g.review_count })
    : t("reason.ratingNone")]);
  return (
    <ul className="reasons">
      {lines.map(([good, text]) => (
        <li key={text} className={good ? "good" : "weak"}>
          <span aria-hidden="true">{good ? "✓" : "–"}</span> {text}
        </li>
      ))}
    </ul>
  );
}

export default function Breakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const { t } = useTranslation();
  return (
    <>
      <dl className="why">
        {Object.entries(breakdown).map(([k, v]) => (
          <div key={k}>
            <dt>{t(`factor.${k}`)}</dt>
            <dd><meter min={0} max={1} value={v} aria-label={t(`factor.${k}`)} />{pct(v)}%</dd>
          </div>
        ))}
      </dl>
      <p className="scorenote">{t("results.scoreNote")}</p>
    </>
  );
}
