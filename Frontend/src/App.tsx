import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import Shell from "./Shell";
import GuideHome from "./pages/GuideHome";
import BookingsPage from "./pages/BookingsPage";
import GuideProfilePage from "./pages/GuideProfilePage";
import PreferencesPage from "./pages/PreferencesPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import SignupPage from "./pages/SignupPage";
import TouristHome from "./pages/TouristHome";
import TripPage from "./pages/TripPage";
import TeamTripPage from "./pages/TeamTripPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import TripsPage from "./pages/TripsPage";
import type { AccountRole } from "./types";

/** Shows `children` only to a signed-in account with one of `roles` (any role when omitted). */
function Private({ roles, children }: { roles?: AccountRole[]; children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user === undefined) return <div className="page"><p role="status">{t("auth.checking")}</p></div>;
  if (user === null) return <Navigate to="/login" replace state={{ from: pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** "/" is each role's dashboard. */
function Home() {
  const { user } = useAuth();
  if (user?.role === "guide") return <GuideHome />;
  return <TouristHome />;
}

/** "My profile": a tourist's details and preferences, or a guide's public profile. */
function MyProfile() {
  return useAuth().user?.role === "guide" ? <GuideProfilePage /> : <PreferencesPage />;
}

// Links shared before sign-in existed pointed here.
function OldGuideLink() {
  return <Navigate to={`/trips/${useParams().id}`} replace />;
}

const TOURIST: AccountRole[] = ["tourist"];
const PEOPLE: AccountRole[] = ["tourist", "guide"];

export default function App() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const pages = (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<Private><Home /></Private>} />
        <Route path="/plan" element={<Private roles={TOURIST}><ProfilePage /></Private>} />
        <Route path="/bookings" element={<Private><BookingsPage /></Private>} />
        <Route path="/profile" element={<Private roles={PEOPLE}><MyProfile /></Private>} />
        <Route path="/preferences" element={<Navigate to="/profile" replace />} />
        <Route path="/t/:id" element={<Private roles={TOURIST}><TeamTripPage /></Private>} />
        <Route path="/availability" element={<Private roles={["guide"]}><AvailabilityPage /></Private>} />
        <Route path="/trips" element={<Private><TripsPage /></Private>} />
        <Route path="/trips/:id" element={<Private><TripPage /></Private>} />
        <Route path="/guide/itinerary/:id" element={<OldGuideLink />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );

  return (
    <>
      <a className="skip" href="#main">{t("skip")}</a>
      {user ? <Shell user={user}>{pages}</Shell> : (
        <>
          <header className="top">
            <Link to="/" className="brand">{t("app")}</Link>
            <button type="button" className="ghost" onClick={() => i18n.changeLanguage(i18n.language === "en" ? "ko" : "en")} lang={i18n.language === "en" ? "ko" : "en"}>
              {t("switchTo")}
            </button>
          </header>
          <main id="main">{pages}</main>
        </>
      )}
    </>
  );
}
