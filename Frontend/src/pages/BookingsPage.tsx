import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listBookings } from "../api";
import { useAuth } from "../AuthContext";
import BookingList from "../BookingList";
import { FilterNote, Loading } from "../Dash";
import type { Booking } from "../types";
import { useLoad } from "../useLoad";

/** Booking requests for whoever is signed in: sent (tourist), received (guide), or all (admin). */
export default function BookingsPage() {
  const { t } = useTranslation();
  const user = useAuth().user!;
  const { data: bookings, setData, failed } = useLoad(listBookings);

  const onChange = (updated: Booking | null) => {
    if (updated) setData((all) => all && all.map((b) => (b.id === updated.id ? updated : b)));
    else listBookings().then(setData).catch(() => {});
  };

  const pendingOnly = useSearchParams()[0].get("status") === "pending"; // set by the dashboard tiles
  const shown = bookings?.filter((b) => !pendingOnly || b.status === "pending");

  const empty = { tourist: "booking.emptyTourist", guide: "booking.emptyGuide", admin: "booking.emptyAdmin" }[user.role];

  return (
    <div className="page wide">
      <h1>{t(user.role === "guide" ? "nav.requests" : "nav.bookings")}{bookings && ` (${bookings.length})`}</h1>
      {!bookings ? <Loading failed={failed} /> : bookings.length === 0 ? (
        <>
          <p>{t(empty)}</p>
          {user.role === "tourist" && <Link to="/plan" className="primary btn">{t("trips.planOne")}</Link>}
        </>
      ) : (
        <>
          {pendingOnly && <FilterNote label={t("booking.pending")} all="/bookings" />}
          {shown!.length === 0 ? <p>{t("dash.noMatches")}</p> : <BookingList bookings={shown!} viewer={user.role} onChange={onChange} />}
        </>
      )}
    </div>
  );
}
