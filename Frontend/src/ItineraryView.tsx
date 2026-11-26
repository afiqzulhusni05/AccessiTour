import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { addComment, addStop, ApiError, approveItinerary, requestAiDraft, deleteStop, getItinerary, sendMessage, setStopProgress, updateStop } from "./api";
import Chat from "./Chat";
import MealPicker from "./MealPicker";
import StopPicker from "./StopPicker";
import { useLocalized } from "./names";
import { Stop } from "./Stop";
import { NavNote } from "./StopNav";
import TripMap from "./TripMap";
import TripProgress from "./TripProgress";
import { STATES } from "./progress";
import type { Itinerary, ItineraryItem, Meal, Progress, Role } from "./types";

const ROLES: Role[] = ["tourist", "guide"];
const MEALS: Meal[] = ["lunch", "dinner"];
const POLL_MS = 3000; // tourist and guide are on different devices; no websockets yet
const SLOT_MIN = 30; // dragging a stop snaps it to half-hour slots
const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** The half-hour slots shown for a day while dragging: 07:00–22:00, widened to fit any stop outside that. */
function daySlots(items: ItineraryItem[]): string[] {
  let lo = 7 * 60, hi = 22 * 60;
  for (const i of items) { const m = toMin(i.start_time); lo = Math.min(lo, m - (m % SLOT_MIN)); hi = Math.max(hi, m); }
  const out: string[] = [];
  for (let m = lo; m <= hi && m < 24 * 60; m += SLOT_MIN) out.push(toHhmm(m));
  return out;
}
type Slot = { day: number; time: string };
type Drag = { item: ItineraryItem; x: number; y: number; slot: Slot | null };

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
  const [mealFor, setMealFor] = useState<{ day: number; meal: Meal } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null); // a stop being dragged to another time slot
  const dragStartY = useRef(0);

  useEffect(() => {
    if (busy || drag) return;
    let live = true;
    const timer = setInterval(() => {
      getItinerary(it.id).then((fresh) => live && onChange(fresh)).catch(() => {});
    }, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [it.id, busy, !!drag, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

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
      onChange(await setStopProgress(it, item.id, next));
    } catch {
      onChange(before);
      setMsg(t("progress.failed", { place: item.place_name }));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Drag a stop by its ⠿ handle. After a small movement every day opens into half-hour slots; the slot under the
   * finger or pointer is where it lands. Near the top or bottom of the screen the page scrolls. Escape cancels.
   * Only the start time and day change; the visit length stays.
   */
  const startDrag = (item: ItineraryItem, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let x = sx, y = sy, active = false, raf = 0;
    let slot: Slot | null = null;
    const slotAt = (): Slot | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
      if (!el) return null;
      const [d, time] = el.dataset.slot!.split("|");
      return { day: +d, time };
    };
    const update = () => { slot = slotAt(); setDrag({ item, x, y, slot }); };
    const tick = () => {
      const edge = 90;
      const v = y < edge ? -(edge - y) / 3 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 3 : 0;
      if (v) { window.scrollBy(0, v); update(); }
      raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX; y = ev.clientY;
      if (!active) {
        if (Math.hypot(x - sx, y - sy) < 6) return;
        active = true;
        dragStartY.current = y;
        raf = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      update();
    };
    const stop = (commit: boolean) => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      setDrag(null);
      const to = slot;
      if (commit && active && to && (to.day !== item.day_number || to.time !== item.start_time)) {
        run(() => updateStop(it, item, { day_number: to.day, start_time: to.time }));
      }
    };
    const up = () => stop(true);
    const cancel = () => stop(false);
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") stop(false); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  };

  // When the slots open, scroll so the stop's own slot sits under the finger instead of jumping away.
  const dragging = drag !== null;
  useLayoutEffect(() => {
    if (!drag) return;
    const t0 = toHhmm(toMin(drag.item.start_time) - (toMin(drag.item.start_time) % SLOT_MIN));
    const el = document.querySelector<HTMLElement>(`[data-slot="${drag.item.day_number}|${t0}"]`);
    if (el) { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top + r.height / 2 - dragStartY.current); }
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const guideName = loc(it.guide_name, it.guide_name_ko);
  const final = it.approved_by_tourist && it.approved_by_guide;
  const editable = role !== null && (!final || reopened);
  // The AI writes the first draft in the background after the itinerary is created (or asked again);
  // it can take a few minutes. Until stops arrive, say so, instead of a bare "No stops yet".
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const AI_WINDOW_MS = 5 * 60 * 1000;
  const started = Math.max(it.created_at ? Date.parse(it.created_at) : 0, askedAt ?? 0);
  const aiWriting = it.items.length === 0 && Date.now() - started < AI_WINDOW_MS;
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
      {it.items.length === 0 && role !== null && (aiWriting ? (
        <div className="notice ai-status" role="status">
          <span className="spinner" aria-hidden="true" />
          <span><strong>{t("ai.creating")}</strong> {t("ai.wait")}</span>
        </div>
      ) : editable && (
        <div className="notice">
          <p>{t("ai.none")}</p>
          <button type="button" className="ghost small" disabled={busy}
            onClick={async () => { if (await run(() => requestAiDraft(it))) setAskedAt(Date.now()); }}>{t("ai.ask")}</button>
        </div>
      ))}

      <TripProgress items={it.items} title={progressTitle} />

      <p role="alert" className="error sticky">{msg}</p>

      <TripMap itinerary={it} editable={editable} busy={busy} onAdd={(f) => run(() => addStop(it, f))} />

      <NavNote hasNeeds={it.trip.mobility !== "normal"} />

      <label className="stopfilter">{t("progress.filter")}
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="all">{t("progress.all")}</option>
          {STATES.map((p) => <option key={p} value={p}>{t(`progress.state.${p}`)}</option>)}
        </select>
      </label>

      {editable && it.items.length > 0 && <p className="muted movehint">{t("collab.moveHint")}</p>}
      {drag && (
        <div className="dragghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <strong>{drag.item.place_name}</strong>
          <small>{drag.slot ? t("collab.moveTo", { day: t("itinerary.day", { n: drag.slot.day }), time: drag.slot.time }) : t("collab.dropHere")}</small>
        </div>
      )}

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
            {editable && addingTo === day && (
              <StopPicker
                itinerary={it} day={day} busy={busy}
                onAdd={async (f) => (await run(() => addStop(it, f))) && setAddingTo(null)}
                onCancel={() => setAddingTo(null)}
              />
            )}
            {editable && mealFor?.day === day && (
              <MealPicker
                key={mealFor.meal} itinerary={it} day={day} meal={mealFor.meal} busy={busy}
                onAdd={async (f) => (await run(() => addStop(it, f))) && setMealFor(null)}
                onCancel={() => setMealFor(null)}
              />
            )}
            {drag ? (
              <ol className="slotgrid" aria-hidden="true">
                {daySlots(items).map((time) => {
                  const here = items.filter((i) => { const m = toMin(i.start_time) - toMin(time); return m >= 0 && m < SLOT_MIN; });
                  const over = drag.slot?.day === day && drag.slot.time === time;
                  return (
                    <li key={time} data-slot={`${day}|${time}`} className={over ? "over" : ""}>
                      <time>{time}</time>
                      <div>
                        {here.map((i) => <span key={i.id} className={"slotstop" + (i.id === drag.item.id ? " from" : "")}>{i.start_time !== time && <b>{i.start_time} </b>}{i.place_name}</span>)}
                        {over && <span className="slotstop to">{drag.item.place_name}</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (<>
            {items.length === 0 && <p className="muted">{t("itinerary.noStops")}</p>}
            {items.length > 0 && show !== "all" && !items.some((i) => i.progress === show) && <p className="muted">{t("progress.noneShown")}</p>}
            <ol className="stops">
              {items.map((item, n) => (show !== "all" && item.progress !== show) ? null : (
                <Stop
                  key={item.id} item={item} prev={items[n - 1]} next={items[n + 1]} near={t(`region.${it.trip.region}`)} accessNeeds={it.trip.mobility !== "normal"} days={it.days} editable={editable} isGuide={role === "guide"} canComment={role !== null} busy={busy}
                  onSave={(f, version) => run(() => updateStop(it, { ...item, version }, f))}
                  onDelete={() => run(() => deleteStop(it, item.id))}
                  onCheck={() => run(() => updateStop(it, item, { accessibility_checked: true }))}
                  onComment={(body) => run(() => addComment(it, item.id, body))}
                  onProgress={(next) => track(item, next)}
                  onDragStart={(e) => startDrag(item, e)}
                />
              ))}
            </ol>
            </>)}
          </section>
        );
      })}

      <Chat
        itineraryId={it.id} messages={it.messages} role={role} busy={busy}
        other={role === "guide" ? t("collab.traveller") : guideName}
        onSend={(body) => run(() => sendMessage(it, body))}
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
              onClick={async () => (await run(() => approveItinerary(it))) && setReopened(false)}
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
