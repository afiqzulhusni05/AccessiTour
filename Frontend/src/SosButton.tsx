import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getEmergencyCard, getNearbyHospitals, type Hospital } from "./api";
import { useAuth } from "./AuthContext";
import { CardFacts, isEmpty } from "./EmergencyCard";
import type { EmergencyCard } from "./types";

type State = "idle" | "locating" | "loading" | "done" | "noLocation" | "failed";

/** Red SOS button on every page. The phone numbers always show, even when the hospital list can't load. */
export default function SosButton() {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>("idle");
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const numbers = t("sos.numbers") as unknown as [string, string][];
  const user = useAuth().user;
  // a signed-in tourist's emergency card, read each time the dialog opens; null = not loaded (or not a tourist)
  const [card, setCard] = useState<EmergencyCard | null>(null);
  const open = () => {
    dialog.current?.showModal();
    if (user?.role === "tourist") getEmergencyCard().then(setCard).catch(() => setCard(null));
  };

  const findHospitals = () => {
    if (!navigator.geolocation) return setState("noLocation");
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setState("loading");
        try {
          const found = await getNearbyHospitals(coords.latitude, coords.longitude);
          setHospitals(found.hospitals);
          setState("done");
        } catch {
          setState("failed");
        }
      },
      () => setState("noLocation"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const busy = state === "locating" || state === "loading";

  return (
    <>
      <button type="button" className="sos-fab" onClick={open} aria-label={t("sos.open")}>
        {t("sos.button")}
      </button>
      <dialog ref={dialog} className="sos-dialog" aria-labelledby="sos-title">
        <header>
          <h2 id="sos-title">{t("sos.title")}</h2>
          <button type="button" className="ghost small" onClick={() => dialog.current?.close()}>{t("sos.close")}</button>
        </header>
        <p className="muted">{t("sos.intro")}</p>
        <ul className="sos-numbers">
          {numbers.map(([num, what]) => (
            <li key={num}>
              <a href={`tel:${num}`} className={num === "119" ? "urgent" : ""}>
                <strong>{num}</strong><span>{what}</span>
              </a>
            </li>
          ))}
        </ul>

        {user?.role === "tourist" && card && (
          <section className="sos-card" aria-labelledby="sos-card-title">
            <h3 id="sos-card-title">{t("card.title")}</h3>
            {isEmpty(card)
              ? <p className="muted">{t("card.sosEmpty")} <Link to="/profile" onClick={() => dialog.current?.close()}>{t("card.sosAdd")}</Link></p>
              : <><p className="muted">{t("card.sosShow")}</p><CardFacts card={card} /></>}
          </section>
        )}

        <h3>{t("sos.hospitalsTitle")}</h3>
        {state !== "done" && (
          <button type="button" className="primary" onClick={findHospitals} disabled={busy}>
            {busy ? t("sos.finding") : t("sos.find")}
          </button>
        )}
        <p role="status" className="muted">{busy ? t("sos.finding") : ""}</p>
        {state === "noLocation" && <p role="alert" className="error">{t("sos.noLocation")}</p>}
        {state === "failed" && <p role="alert" className="error">{t("sos.failed")}</p>}
        {state === "done" && hospitals.length === 0 && <p>{t("sos.none")}</p>}
        {state === "done" && hospitals.length > 0 && (
          <ul className="sos-hospitals">
            {hospitals.map((h) => (
              <li key={h.hpid ?? h.name}>
                <div>
                  <strong>{h.name}</strong>
                  <small>
                    {[h.kind, h.distance_m != null ? t("sos.away", { km: (h.distance_m / 1000).toFixed(1) }) : null].filter(Boolean).join(" · ")}
                  </small>
                  {h.address && <small>{h.address}</small>}
                </div>
                <div className="rowbtns">
                  {h.phone && <a className="btn small" href={`tel:${h.phone}`}>{t("sos.call", { phone: h.phone })}</a>}
                  <a className="btn small" target="_blank" rel="noreferrer"
                    href={`https://map.kakao.com/link/to/${encodeURIComponent(h.name)},${h.latitude},${h.longitude}`}>
                    {t("sos.directions")}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
