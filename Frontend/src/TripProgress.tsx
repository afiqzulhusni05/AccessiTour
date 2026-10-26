import { useTranslation } from "react-i18next";
import { currentStop, summarize } from "./progress";
import type { ItineraryItem } from "./types";

/** The progress section at the top of an itinerary. Everything is counted from the stops as they are right now. */
export default function TripProgress({ items, title }: { items: ItineraryItem[]; title?: string }) {
  const { t } = useTranslation();
  const s = summarize(items);
  const now = currentStop(items);
  return (
    <section className="tripprogress" aria-label={title ?? t("progress.title")}>
      <div className="head">
        <h2>{title ?? t("progress.title")}</h2>
        <strong>{s.percent}%</strong>
      </div>
      <progress max={100} value={s.percent} aria-label={t("progress.barLabel", { percent: s.percent })} />
      <dl>
        <div><dt>{t("progress.visited")}</dt><dd>{t("progress.of", { n: s.visited, total: s.total })}</dd></div>
        <div><dt>{t("progress.remaining")}</dt><dd>{s.remaining}</dd></div>
        <div><dt>{t("progress.skipped")}</dt><dd>{s.skipped}</dd></div>
      </dl>
      <p className="muted">
        {s.total === 0 ? t("progress.none")
          : now ? t(now.progress === "on_the_way" ? "progress.heading" : "progress.next", { place: now.place_name, time: now.start_time })
          : t("progress.done")}
      </p>
    </section>
  );
}
