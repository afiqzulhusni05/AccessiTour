import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getNearbyRestrooms } from "./api";
import type { TeamRestroom } from "./teamApi";

/**
 * For travellers with mobility needs: the closest public restroom with an accessible toilet to one stop,
 * from the public restroom data (data.go.kr). Looked up only when asked, so opening a stop stays quick.
 */
export default function NearestToilet({ lat, lng, place }: { lat: number; lng: number; place: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [found, setFound] = useState<TeamRestroom | null>(null);

  const look = async () => {
    setState("loading");
    try {
      const all = await getNearbyRestrooms(lat, lng, true);
      setFound([...all].sort((a, b) => a.distance_m - b.distance_m)[0] ?? null);
      setState("done");
    } catch {
      setState("failed");
    }
  };

  if (state === "idle" || state === "loading") {
    return (
      <button type="button" className="textlink" onClick={look} disabled={state === "loading"}
        aria-label={t("toilet.findFor", { place })}>
        ♿ {t(state === "loading" ? "toilet.finding" : "toilet.find")}
      </button>
    );
  }
  if (state === "failed") return <p className="muted small-note" role="alert">{t("toilet.failed")}</p>;
  if (!found) return <p className="muted small-note">{t("toilet.none")}</p>;
  return (
    <p className="nearest-toilet">
      <span aria-hidden="true">♿ </span>
      <strong>{found.name}</strong>{" · "}{t("toilet.away", { m: Math.round(found.distance_m) })}
      {found.opening_hours && ` · ${t("near.hours", { hours: found.opening_hours })}`}
      {" · "}
      <a href={`https://map.kakao.com/link/to/${encodeURIComponent(found.name.replace(/[,/]/g, " "))},${found.latitude},${found.longitude}`}
        target="_blank" rel="noopener noreferrer">{t("sos.directions")}</a>
    </p>
  );
}
