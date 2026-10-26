import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { decideBooking } from "./api";
import { useLocalized } from "./names";
import type { AccountRole, Booking } from "./types";

/**
 * Booking requests with the actions the viewer may take: a tourist cancels, a guide accepts or
 * declines, the admin cancels. `onChange` receives the updated booking, or null to ask for a reload.
 */
export default function BookingList({ bookings, viewer, onChange }: {
  bookings: Booking[];
  viewer: AccountRole;
  onChange: (updated: Booking | null) => void;
}) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const [err, setErr] = useState("");

  const act = async (b: Booking, action: "accept" | "decline" | "cancel") => {
    const question = { accept: "", decline: t("booking.confirmDecline", { name: b.owner_name }), cancel: t("booking.confirmCancel") }[action];
    if (question && !window.confirm(question)) return;
    setBusy({ id: b.id, action });
    setErr("");
    try {
      onChange(await decideBooking(b.id, action));
    } catch {
      setErr(t("booking.failed"));
      onChange(null);
    } finally {
      setBusy(null);
    }
  };

  const list = (xs: string[], ns: string) => xs.map((x) => t(`${ns}.${x}`)).join(", ") || "–";

  return (
    <>
      <p role="alert" className="error">{err}</p>
      <p role="status" className="muted">{busy?.action === "accept" ? t("booking.accepting") : ""}</p>
      <ul className="bookings">
        {bookings.map((b) => {
          const guide = t("booking.withGuide", { name: loc(b.guide_name, b.guide_name_ko) });
          const from = t("booking.from", { name: b.owner_name });
          const p = b.trip;
          const working = busy?.id === b.id;
          return (
            <li key={b.id}>
              <div className="row1">
                <h3>{t(`region.${p.region}`)} · {viewer === "tourist" ? guide : from}</h3>
                <span className={"state " + b.status}>{t(`booking.status.${b.status}`)}</span>
              </div>
              <p className="muted">
                {p.start_date} – {p.end_date} · {t("booking.match", { pct: Math.round(b.score * 100) })}
                {viewer === "admin" && ` · ${guide}`}
              </p>
              <details>
                <summary>{t("booking.details")}</summary>
                <dl className="facts">
                  <dt>{t("trip.party")}</dt><dd>{p.party_size}</dd>
                  <dt>{t("trip.budget")}</dt><dd>₩{p.budget_per_day.toLocaleString()}</dd>
                  <dt>{t("trip.language")}</dt><dd>{list(p.languages, "lang")}</dd>
                  <dt>{t("needs.mobility")}</dt><dd>{(t(`mobility.${p.mobility}`) as unknown as string[])[0]}</dd>
                  <dt>{t("needs.interests")}</dt><dd>{list(p.interests, "interest")}</dd>
                  <dt>{t("needs.dietary")}</dt><dd>{list(p.dietary, "diet")}</dd>
                </dl>
              </details>
              <div className="rowbtns">
                {b.status === "pending" && viewer === "guide" && (
                  <>
                    <button type="button" className="primary small" disabled={working} onClick={() => act(b, "accept")} aria-label={`${t("booking.accept")}: ${b.owner_name}`}>{t("booking.accept")}</button>
                    <button type="button" className="ghost small danger" disabled={working} onClick={() => act(b, "decline")} aria-label={`${t("booking.decline")}: ${b.owner_name}`}>{t("booking.decline")}</button>
                  </>
                )}
                {b.status === "pending" && viewer !== "guide" && (
                  <button type="button" className="ghost small danger" disabled={working} onClick={() => act(b, "cancel")}>{t("booking.cancel")}</button>
                )}
                {b.itinerary_id !== null && (
                  <Link to={`/trips/${b.itinerary_id}`} className="primary btn small">{t("booking.open")}</Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
