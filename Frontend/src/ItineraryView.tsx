import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addComment, addStop, ApiError, approveItinerary, deleteStop, getItinerary, sendMessage, setStopProgress, updateStop } from "./api";
import Chat from "./Chat";
import MealPicker from "./MealPicker";
import { useLocalized } from "./names";
import { Stop, StopForm } from "./Stop";
import { NavSettings, useNavPrefs } from "./StopNav";
import TripMap from "./TripMap";
import TripProgress from "./TripProgress";
import { STATES } from "./progress";
import type { Itinerary, ItineraryItem, Meal, Progress, Role } from "./types";

const ROLES: Role[] = ["tourist", "guide"];
const MEALS: Meal[] = ["lunch", "dinner"];
const POLL_MS = 3000; // tourist and guide are on different devices; no websockets yet
const dayDate = (start: string, day: number) =>
  new Date(Date.parse(start) + (day - 1) * 864e5).toISOString().slice(0, 10);

/** The shared itinerary body: stops, comments and approval, acting as `role`. */
export default function ItineraryView({ itinerary: it, onChange, role, progressTitle }: {
  progressTitle?: string; // on a multi-city trip, says which city this progress is for
  itinerary: Itinerary;
  onChange: (it: Itinerary) => void;
  role: Role | null; // null = the admin, who can look but not change anything
}) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [show, setShow] = useState<Progress | "all">("all"); // only hides stops on screen; counts use every stop
  const [menuDay, setMenuDay] = useState<number | null>(null); // the day whose "+" menu is open
  const [reopened, setReopened] = useState(false);
  const [nav, setNav] = useNavPrefs();
  const [mealFor, setMealFor] = useState<{ day: number; meal: Meal } | null>(null);

  useEffect(() => {
    if (busy) return;
    let live = true;
    const timer = setInterval(() => {
      getItinerary(it.id).then((fresh) => live && onChange(fresh)).catch(() => {});
    }, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [it.id, busy, onChange]);

  const run = async (op: () => Promise<Itinerary>) => {
    setBusy(true);
    setMsg("");
    try {
      onChange(await op());
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setMsg(t("collab.conflict"));
        getItinerary(it.id).then(onChange).catch(() => {});
      } else {
        setMsg(t("collab.failed"));
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Progress shows straight away and is saved in the background. If the save fails, the stop goes back to what it
   * was and a message says so. `busy` disables the buttons meanwhile, so two saves cannot cross.
   */
  const track = async (item: ItineraryItem, next: Progress) => {
    const before = it;
    setBusy(true);
    setMsg("");
    onChange({
      ...it,
      items: it.items.map((i) =>
        i.id === item.id ? { ...i, progress: next }
          : next === "on_the_way" && i.progress === "on_the_way" ? { ...i, progress: "upcoming" as const } : i),
    });
    try {
      onChange(await setStopProgress(it.id, item.id, next));
    } catch {
      onChange(before);
      setMsg(t("progress.failed", { place: item.place_name }));
    } finally {
      setBusy(false);
    }
  };

  const guideName = loc(it.guide_name, it.guide_name_ko);
  const final = it.approved_by_tourist && it.approved_by_guide;
  const editable = role !== null && (!final || reopened);
  const checksOpen = it.items.some((i) => i.needs_accessibility_check);
  const mine = role === "guide" ? it.approved_by_guide : it.approved_by_tourist;
  const who = (r: Role) => (r === "guide" ? `${guideName} (${t("collab.role.guide")})` : t("collab.role.tourist"));

  return (
    <>
      {final ? (
        <p className="notice final">
          {t("collab.final")}
          {role && !reopened && <button type="button" className="ghost small" onClick={() => setReopened(true)}>{t("collab.reopen")}</button>}
        </p>
      ) : (
        <>
          {it.source === "ai" && <p className="muted">{t("itinerary.draftNote")}</p>}
          {it.source === "sample" && <p className="notice">{t("itinerary.sample")}</p>}
        </>
      )}
      {checksOpen && <p className="notice check">{t("itinerary.checkNote")}</p>}

      <TripProgress items={it.items} title={progressTitle} />

      <p role="alert" className="error sticky">{msg}</p>

      <TripMap itinerary={it} editable={editable} busy={busy} onAdd={(f) => run(() => addStop(it.id, f))} />

      <NavSettings prefs={nav} onChange={setNav} hasNeeds={it.trip.mobility !== "normal"} />

      <label className="stopfilter">{t("progress.filter")}
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="all">{t("progress.all")}</option>
          {STATES.map((p) => <option key={p} value={p}>{t(`progress.state.${p}`)}</option>)}
        </select>
      </label>

      {Array.from({ length: it.days }, (_, i) => i + 1).map((day) => {
        const items = it.items.filter((i) => i.day_number === day);
        return (
          <section key={day}>
            <div className="dayhead">
              <h2>{t("itinerary.day", { n: day })} <small className="muted">{dayDate(it.trip.start_date, day)}</small></h2>
              {editable && (
                <button
                  type="button" className="ghost addbtn" aria-expanded={menuDay === day}
                  aria-label={t("collab.addTo", { day: t("itinerary.day", { n: day }) })} title={t("collab.addTo", { day: t("itinerary.day", { n: day }) })}
                  onClick={() => setMenuDay(menuDay === day ? null : day)}
                ><span aria-hidden="true">{menuDay === day ? "×" : "+"}</span></button>
              )}
            </div>
            {editable && menuDay === day && (
              <div className="rowbtns addmenu">
                <button type="button" className="ghost small" onClick={() => { setAddingTo(day); setMenuDay(null); }}>{t("collab.add")}</button>
                {MEALS.filter((m) => !items.some((i) => i.meal === m)).map((m) => (
                  <button key={m} type="button" className="ghost small" onClick={() => { setMealFor({ day, meal: m }); setMenuDay(null); }}>
                    {t(m === "lunch" ? "meal.addLunch" : "meal.addDinner")}
                  </button>
                ))}
              </div>
            )}
            {items.length === 0 && <p className="muted">{t("itinerary.noStops")}</p>}
            {items.length > 0 && show !== "all" && !items.some((i) => i.progress === show) && <p className="muted">{t("progress.noneShown")}</p>}
            <ol className="stops">
              {items.map((item, n) => (show !== "all" && item.progress !== show) ? null : (
                <Stop
                  key={item.id} item={item} prev={items[n - 1]} next={items[n + 1]} nav={nav} near={t(`region.${it.trip.region}`)} days={it.days} editable={editable} isGuide={role === "guide"} canComment={role !== null} busy={busy}
                  onSave={(f, version) => run(() => updateStop(it.id, { ...item, version }, f))}
                  onDelete={() => run(() => deleteStop(it.id, item.id))}
                  onCheck={() => run(() => updateStop(it.id, item, { accessibility_checked: true }))}
                  onComment={(body) => run(() => addComment(it.id, item.id, body))}
                  onProgress={(next) => track(item, next)}
                />
              ))}
            </ol>
            {editable && addingTo === day && (
              <StopForm
                initial={{ day_number: day, start_time: "12:00", place_name: "", activity: "" }}
                days={it.days} submitLabel={t("collab.addSave")} busy={busy}
                onSubmit={async (f) => (await run(() => addStop(it.id, f))) && setAddingTo(null)}
                onCancel={() => setAddingTo(null)}
              />
            )}
            {editable && mealFor?.day === day && (
              <MealPicker
                key={mealFor.meal} itinerary={it} day={day} meal={mealFor.meal} busy={busy}
                onAdd={async (f) => (await run(() => addStop(it.id, f))) && setMealFor(null)}
                onCancel={() => setMealFor(null)}
              />
            )}
          </section>
        );
      })}

      <Chat
        itineraryId={it.id} messages={it.messages} role={role} busy={busy}
        other={role === "guide" ? t("collab.traveller") : guideName}
        onSend={(body) => run(() => sendMessage(it.id, body))}
      />

      <div className="approval">
        <h2>{t("collab.approvals")}</h2>
        <ul>
          {ROLES.map((r) => {
            const ok = r === "guide" ? it.approved_by_guide : it.approved_by_tourist;
            return <li key={r} className={ok ? "yes" : "muted"}>{ok ? "✓" : "○"} {who(r)}: {t(ok ? "collab.approved" : "collab.waiting")}</li>;
          })}
        </ul>
        {role && !mine && (
          <>
            <button
              type="button" className="primary" disabled={busy || (role === "guide" && checksOpen)}
              onClick={async () => (await run(() => approveItinerary(it.id))) && setReopened(false)}
            >
              {t("collab.approve", { who: t(`collab.role.${role}`) })}
            </button>
            <p className="muted">{role === "guide" && checksOpen ? t("collab.checksOpen") : t("collab.approvalHint")}</p>
          </>
        )}
      </div>
    </>
  );
}
