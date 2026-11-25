import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, listBookings, payBooking } from "../api";
import { Loading } from "../Dash";
import type { Booking } from "../types";
import { useLoad } from "../useLoad";

const METHODS = ["card", "kakaopay", "tosspay"] as const;

/**
 * Paying the guide's fee for an accepted booking. A DEMO for the capstone: it asks for no card details,
 * charges nothing and contacts no payment company. It only records the booking as paid.
 */
export default function PaymentPage() {
  const { t, i18n } = useTranslation();
  const id = Number(useParams().id);
  const { data, setData, failed } = useLoad(async () => (await listBookings()).find((b) => b.id === id) ?? null);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("card");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const back = <Link to="/bookings" className="backlink">← {t("nav.bookings")}</Link>;
  if (data === undefined) return <div className="page formpage">{back}<Loading failed={failed} /></div>;
  if (!data) return <div className="page formpage">{back}<p role="alert" className="error">{t("pay.notFound")}</p></div>;

  const b: Booking = data;
  const p = b.trip;
  const fee = b.team?.total_price ?? 0;
  const paid = b.team?.paid_at;
  const payable = b.status === "accepted" || b.status === "completed";
  const when = p.start_date === p.end_date ? p.start_date : `${p.start_date} – ${p.end_date}`;

  const pay = async () => {
    setBusy(true);
    setErr("");
    try {
      setData(await payBooking(b.id));
    } catch (e) {
      setErr(e instanceof ApiError && e.detail ? e.detail : t("pay.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page formpage">
      {back}
      <h1>{t("pay.title")}</h1>
      <p className="notice check" role="note">{t("pay.demo")}</p>

      <section className="pay-summary" aria-label={t("pay.summary")}>
        <dl className="facts">
          <dt>{t("pay.guide")}</dt><dd>{b.guide_name}</dd>
          <dt>{t("trip.region")}</dt><dd>{t(`region.${p.region}`)}</dd>
          <dt>{t("guide.dates")}</dt><dd>{when}{b.team?.hours ? ` · ${b.team.hours}` : ""}</dd>
          <dt>{t("trip.party")}</dt><dd>{p.party_size}</dd>
        </dl>
        <p className="pay-total"><span>{t("pay.total")}</span><strong>₩{fee.toLocaleString()}</strong></p>
      </section>

      {paid ? (
        <p className="notice final" role="status">
          ✓ {t("pay.paidOn", { date: new Date(paid).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      ) : !payable ? (
        <p className="notice">{t("pay.notYet")}</p>
      ) : (
        <>
          <fieldset>
            <legend className="fieldlabel">{t("pay.method")}</legend>
            <div className="chips" role="radiogroup" aria-label={t("pay.method")}>
              {METHODS.map((m) => (
                <label key={m} className="chip">
                  <input type="radio" name="pay-method" checked={method === m} onChange={() => setMethod(m)} />
                  <span>{t(`pay.methods.${m}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p role="alert" className="error">{err}</p>
          <button type="button" className="primary" disabled={busy} onClick={pay}>
            {busy ? t("pay.paying") : t("pay.button", { amount: fee.toLocaleString() })}
          </button>
        </>
      )}
    </div>
  );
}
