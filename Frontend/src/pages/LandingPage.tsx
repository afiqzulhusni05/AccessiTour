import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Simple line icons, same style as the sidebar menu.
const ICONS = {
  speech: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h2M18 9v6a4 4 0 0 1-4 4h-2",
  help: "M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11zM12 7v6M9 10h6",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const WHY_ICONS: (keyof typeof ICONS)[] = ["speech", "route", "help"];
const CITIES = ["seoul", "busan", "jeju"] as const;

/** What visitors see before signing in: what AccessiTour is, who it's for, and how to start. */
export default function LandingPage() {
  const { t } = useTranslation();
  const why = t("landing.why") as unknown as [string, string][];
  const how = t("landing.how") as unknown as [string, string][];

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">{t("landing.eyebrow")}</p>
          <h1>{t("landing.title")}</h1>
          <p className="lead">{t("landing.lead")}</p>
          <div className="hero-actions">
            <Link to="/signup" state={{ from: "/plan" }} className="btn cta">{t("landing.start")}</Link>
            <Link to="/login" className="btn ghost light">{t("landing.signIn")}</Link>
          </div>
        </div>
      </section>
      <div className="paving" aria-hidden="true" />

      <section className="band" aria-labelledby="why-title">
        <h2 id="why-title">{t("landing.whyTitle")}</h2>
        <ul className="features">
          {why.map(([title, text], i) => (
            <li key={title}>
              <span className="feature-icon"><Icon name={WHY_ICONS[i]} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="band alt" aria-labelledby="how-title">
        <h2 id="how-title">{t("landing.howTitle")}</h2>
        <ol className="how">
          {how.map(([title, text]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band" aria-labelledby="cities-title">
        <h2 id="cities-title">{t("landing.citiesTitle")}</h2>
        <ul className="cities">
          {CITIES.map((id) => {
            const [name, text] = t(`landing.cities.${id}`) as unknown as [string, string];
            return (
              <li key={id} className={`city city-${id}`}>
                <div className="city-photo" role="img" aria-label={name} />
                <div className="city-text">
                  <h3>{name}</h3>
                  <p>{text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="band guide-band">
        <div>
          <h2>{t("landing.guideTitle")}</h2>
          <p>{t("landing.guideText")}</p>
        </div>
        <Link to="/signup" state={{ role: "guide" }} className="btn primary">{t("landing.guideCta")}</Link>
      </section>

      <footer className="landing-foot">
        <p className="sos"><strong>SOS</strong> {t("landing.sos")}</p>
        <p className="muted">{t("landing.credit")}</p>
      </footer>
    </div>
  );
}
