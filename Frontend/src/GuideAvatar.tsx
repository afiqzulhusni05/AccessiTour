import { useState } from "react";
import { useTranslation } from "react-i18next";

// A few KULMS tones, so guides without a photo don't all look the same; chosen from the name, so stable.
const TONES = ["crimson", "dark", "rose", "sand"] as const;
const toneOf = (name: string) => TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

/**
 * A guide's face: their photo when they have uploaded one (`photo` = the team API's `photo_url`), otherwise a circle
 * with their first initial. A photo that fails to load also falls back to the initial. Decorative next to the name,
 * so the initial is hidden from screen readers; a photo is described ("Photo of Hana").
 */
export default function GuideAvatar({ name, photo, size = "md" }: { name: string; photo?: string | null; size?: "sm" | "md" | "lg" }) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const cls = `gavatar ${size}`;
  if (photo && !broken) {
    return <img className={cls} src={photo} alt={t("teamtrip.photoOf", { name })} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  }
  return <span className={`${cls} ${toneOf(name)}`} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "?"}</span>;
}
