import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, decideBooking, deleteBooking } from "./api";
import { useLocalized } from "./names";
import type { AccountRole, Booking } from "./types";
import Avatar from "./Avatar";

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

  const act = async (b: Booking, action: "accept" | "decline" | "cancel" | "complete") => {
    const question = {
      accept: "", decline: t("booking.confirmDecline", { name: b.owner_name }), cancel: t("booking.confirmCancel"),
      complete: t("booking.confirmComplete", { name: b.owner_name }),
    }[action];
    if (question && !window.confirm(question)) return;
    setBusy({ id: b.id, action });
    setErr("");
    try {
      onChange(await decideBooking(b.id, action));
    } catch (e) {
      setErr(e instanceof ApiError && e.detail ? e.detail : t("booking.failed"));
      onChange(null);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (b: Booking) => {
    if (!window.confirm(t("booking.confirmDelete"))) return;
    setBusy({ id: b.id, action: "delete" });
    setErr("");
    try {
      await deleteBooking(b.id);
    } catch (e) {
      setErr(e instanceof ApiError && e.detail ? e.detail : t("booking.failed"));
    } finally {
      setBusy(null);
      onChange(null); // reload either way: the booking is gone, or its state changed
    }
  };
  const today = new Date().toLocaleDateString("sv");
  // The team API lets the guide close a trip only once both sides approved the itinerary and the last day has come.
  const confirmed = (b: Booking) => b.team?.status === "CONFIRMED";
  // After its last day a booking can't be cancelled; if it was never confirmed, it can be deleted instead
  const ended = (b: Booking) => b.trip.end_date < today;
  const deletable = (b: Booking) => Boolean(b.team) && (b.status === "cancelled" || b.status === "declined"
    || (ended(b) && (b.status === "pending" || b.status === "accepted") && !confirmed(b)));
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
                {viewer === "tourist" && <Avatar name={loc(b.guide_name, b.guide_name_ko)} photo={b.guide_photo} size="sm" />}
                {viewer === "guide" && <Avatar name={b.owner_name} photo={b.owner_photo} size="sm" />}
                <h3>{t(`region.${p.region}`)} · {viewer === "tourist" ? guide : from}</h3>
                <span className={"state " + b.status}>{t(`booking.status.${b.status}`)}</span>
              </div>
              <p className="muted">
                {p.start_date === p.end_date ? p.start_date : `${p.start_date} – ${p.end_date}`}{b.team?.hours && ` · ${b.team.hours}`}
                {b.score !== null && ` · ${t("booking.match", { pct: Math.round(b.score * 100) })}`}
                {b.team && ` · ₩${b.team.total_price.toLocaleString()}`}
                {viewer === "admin" && ` · ${guide}`}
              </p>
              <details>
                <summary>{t("booking.details")}</summary>
                <dl className="facts">
                  <dt>{t("trip.party")}</dt><dd>{p.party_size}</dd>
                  {b.team
                    ? <><dt>{t("booking.fee")}</dt><dd>₩{b.team.total_price.toLocaleString()}</dd></>
                    : <><dt>{t("trip.budget")}</dt><dd>₩{p.budget_per_day.toLocaleString()}</dd></>}
                  <dt>{t("trip.language")}</dt><dd>{list(p.languages, "lang")}</dd>
                  <dt>{t("needs.mobility")}</dt><dd>{(t(`mobility.${p.mobility}`) as unknown as string[])[0]}</dd>
                  {!b.team && <>
                    <dt>{t("needs.interests")}</dt><dd>{list(p.interests, "interest")}</dd>
                    <dt>{t("needs.dietary")}</dt><dd>{list(p.dietary, "diet")}</dd>
                  </>}
                </dl>
              </details>
              <div className="rowbtns">
                {b.status === "pending" && viewer === "guide" && p.start_date >= today && (
                  <>
                    <button type="button" className="primary small" disabled={working} onClick={() => act(b, "accept")} aria-label={`${t("booking.accept")}: ${b.owner_name}`}>{t("booking.accept")}</button>
                    <button type="button" className="ghost small danger" disabled={working} onClick={() => act(b, "decline")} aria-label={`${t("booking.decline")}: ${b.owner_name}`}>{t("booking.decline")}</button>
                  </>
                )}
                {viewer === "guide" && b.status === "accepted" && confirmed(b) && (p.end_date <= today ? (
                  <button type="button" className="primary small" disabled={working} onClick={() => act(b, "complete")}>{t("booking.complete")}</button>
                ) : <p className="muted small-note">{t("booking.completeLater", { date: p.end_date })}</p>)}
                {viewer === "guide" && b.status === "accepted" && !confirmed(b) && p.end_date === today && <p className="muted small-note">{t("booking.completeNeedsApproval")}</p>}
                {ended(b) && (b.status === "pending" || b.status === "accepted") && !confirmed(b) && <p className="muted small-note">{t("booking.endedUnconfirmed")}</p>}
                {b.team && b.status === "accepted" && !ended(b) && (
                  <button type="button" className="ghost small danger" disabled={working} onClick={() => act(b, "cancel")}>{t("booking.cancelBooking")}</button>
                )}
                {deletable(b) && (
                  <button type="button" className="ghost small danger" disabled={working} onClick={() => remove(b)}
                    aria-label={`${t("booking.delete")}: ${t(`region.${p.region}`)} ${p.start_date}`}>{t("booking.delete")}</button>
                )}
                {b.status === "pending" && viewer !== "guide" && !ended(b) && (
                  <button type="button" className="ghost small danger" disabled={working} onClick={() => act(b, "cancel")}>{t("booking.cancel")}</button>
                )}
                {b.team?.paid_at && <span className="paid-badge">✓ {t("pay.paid")}</span>}
                {viewer === "tourist" && b.team && !b.team.paid_at && (b.status === "accepted" || b.status === "completed") && (
                  <Link to={`/pay/${b.id}`} className="primary btn small">{t("pay.payNow")}</Link>
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
