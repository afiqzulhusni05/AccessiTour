import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, getConnectingOptions, requestTeamBookingForDays } from "./api";
import Avatar from "./Avatar";
import type { TeamConnectingLeg, TeamConnectingPlan, TeamLegOption } from "./teamApi";

/**
 * "Connecting" options for a long stay, like transit flights: when no single guide is free on every day,
 * a few guides can share it. Each leg is requested on its own. Shown below the guides free on every day.
 */
export default function CoveragePlanner({ segmentId, onBooked, title }: {
  segmentId: number;
  onBooked: () => void;
  title?: string;
}) {
  const { t, i18n } = useTranslation();
  const [options, setOptions] = useState<TeamConnectingPlan[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({}); // "option:leg" -> chosen guide id
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    getConnectingOptions(segmentId).then((r) => setOptions(r.options)).catch(() => setOptions([]));
  }, [segmentId]);
  useEffect(load, [load]);

  if (!options || options.length === 0) return null;

  const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const choices = (leg: TeamConnectingLeg): TeamLegOption[] => [leg, ...leg.alternatives];
  const chosen = (oi: number, li: number, leg: TeamConnectingLeg) =>
    choices(leg).find((c) => c.guide.id === picked[`${oi}:${li}`]) ?? leg;

  const request = async (key: string, legs: TeamLegOption[]) => {
    setBusy(key);
    setMsg("");
    try {
      for (const leg of legs) await requestTeamBookingForDays(segmentId, leg.guide.id, leg.start_date, leg.end_date);
      onBooked();
    } catch (e) {
      setMsg(e instanceof ApiError && e.detail ? e.detail : t("booking.requestFailed"));
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="connecting">
      <h3 className="guides-split">{title ?? t("teamtrip.connecting", { defaultValue: "Mix of guides (like a transit flight)" })}</h3>
      <p className="muted">{t("teamtrip.connectingNote", { defaultValue: "Nobody is free for every day? These guides can share your stay. Request each part, or all at once." })}</p>
      {msg && <p role="alert" className="error">{msg}</p>}
      <ol className="guides">
        {options.map((plan, oi) => {
          const legs = plan.legs.map((leg, li) => chosen(oi, li, leg));
          const total = legs.reduce((sum, l) => sum + l.price, 0);
          return (
            <li key={oi} className="teamguide connecting-option">
              <div className="who">
                <h3>
                  {plan.changes === 0
                    ? t("teamtrip.oneGuidePart", { defaultValue: "One guide, some days" })
                    : t("teamtrip.changes", { count: plan.changes, defaultValue: `${plan.changes} guide change(s)` })}
                </h3>
                <ol className="legs">
                  {plan.legs.map((leg, li) => {
                    const c = legs[li];
                    const key = `${oi}:${li}`;
                    return (
                      <li key={key} className="leg">
                        <p><strong>{day(leg.start_date)}{leg.days > 1 ? ` – ${day(leg.end_date)}` : ""}</strong> · {t("guide.days", { count: leg.days })}</p>
                        <div className="whohead">
                          <Avatar name={c.guide.full_name} photo={c.guide.photo_url} />
                          <div>
                            {leg.alternatives.length > 0 ? (
                              <select aria-label={t("teamtrip.pickGuide", { defaultValue: "Guide for these days" })} value={c.guide.id}
                                onChange={(e) => setPicked((p) => ({ ...p, [key]: Number(e.target.value) }))}>
                                {choices(leg).map((o) => (
                                  <option key={o.guide.id} value={o.guide.id}>{o.guide.full_name} · {Math.round(o.total_score)}%</option>
                                ))}
                              </select>
                            ) : (
                              <strong>{c.guide.full_name}</strong>
                            )}
                            <p className="muted">
                              {c.guide.languages.map((l) => t(`lang.${l}`)).join(", ")} · {Math.round(c.total_score)}% · ₩{c.price.toLocaleString()}
                            </p>
                          </div>
                          <button type="button" className="ghost small" disabled={busy !== null} onClick={() => request(key, [c])}>
                            {busy === key ? t("teamtrip.requesting") : t("teamtrip.request")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {plan.uncovered_days.length > 0 && (
                  <p className="warn">
                    {t("teamtrip.noGuideDays", { defaultValue: "No guide is free on" })}: {plan.uncovered_days.map(day).join(", ")}
                  </p>
                )}
              </div>
              <div className="score">
                <strong>{Math.round(plan.average_score)}%</strong>
                <p className="price">₩{total.toLocaleString()}</p>
                <button type="button" className="primary small" disabled={busy !== null} onClick={() => request(`all:${oi}`, legs)}>
                  {busy === `all:${oi}` ? t("teamtrip.requesting") : t("teamtrip.requestAll", { defaultValue: "Request all" })}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}