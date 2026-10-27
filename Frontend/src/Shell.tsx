import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import type { AccountRole, User } from "./types";

const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  plus: "M12 5v14M5 12h14",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  user: "M20 20v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M4 10h16",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// [path, label key, icon, match the path exactly?]
const MENU: Record<AccountRole, [string, string, keyof typeof ICONS, boolean][]> = {
  tourist: [
    ["/", "nav.dashboard", "home", true], ["/plan", "nav.plan", "plus", false], ["/bookings", "nav.bookings", "calendar", false],
    ["/trips", "nav.trips", "map", false], ["/profile", "nav.profile", "user", false],
  ],
  guide: [
    ["/", "nav.dashboard", "home", true], ["/bookings", "nav.requests", "calendar", false],
    ["/trips", "nav.trips", "map", false], ["/availability", "nav.availability", "calendar", false], ["/profile", "nav.profile", "user", false],
  ],
  admin: [], // the team API has no admin accounts
};

/** Layout for signed-in pages: sidebar menu for the account's role, top bar with the account and language. */
export default function Shell({ user, children }: { user: User; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    navigate("/login", { replace: true }); // first, so the next person to sign in isn't sent to this account's page
    logout();
  };
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brand">{t("app")}<small>{t(`nav.panel.${user.role}`)}</small></Link>
        <nav aria-label={t("nav.main")}>
          {MENU[user.role].map(([to, label, icon, end]) => (
            <NavLink key={to} to={to} end={end}><Icon name={icon} />{t(label)}</NavLink>
          ))}
        </nav>
        <button type="button" className="logout" onClick={signOut}><Icon name="logout" />{t("auth.signOut")}</button>
      </aside>
      <div className="main-col">
        <header className="topbar">
          {/* pages add their own buttons here (the itinerary chat icon) */}
          <div id="top-actions" />
          <button type="button" className="ghost small" onClick={() => i18n.changeLanguage(i18n.language === "en" ? "ko" : "en")} lang={i18n.language === "en" ? "ko" : "en"}>
            {t("switchTo")}
          </button>
          <span className="whoami">
            <span className="avatar" aria-hidden="true">{user.display_name.slice(0, 1).toUpperCase()}</span>
            <span>{user.display_name}<small>{t(`role.${user.role}`)}</small></span>
          </span>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
