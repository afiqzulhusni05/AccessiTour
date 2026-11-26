import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { teamToken } from "./api";
import * as team from "./teamApi";

// A few KULMS tones, so people without a photo don't all look the same; chosen from the name, so stable.
const TONES = ["crimson", "dark", "rose", "sand"] as const;
type Tone = (typeof TONES)[number];
const toneOf = (name: string) => TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

// Photos need the sign-in token, so they're fetched once and shared as object URLs. The path carries a
// version (?v=), so a changed photo is a new entry.
const loaded = new Map<string, Promise<string>>();
function usePhoto(photo?: string | null): string | null {
  const direct = photo && /^(https?:|data:|blob:)/.test(photo) ? photo : null;
  const [url, setUrl] = useState<string | null>(direct);
  useEffect(() => {
    setUrl(direct);
    const tok = teamToken();
    if (!photo || direct || !tok) return;
    let live = true;
    let p = loaded.get(photo);
    if (!p) {
      p = team.photoBlob(tok, photo).then((b) => URL.createObjectURL(b));
      p.catch(() => loaded.delete(photo));
      loaded.set(photo, p);
    }
    p.then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [photo, direct]);
  return url;
}

/**
 * A person's face: their profile photo when they have one (`photo` = the team API's `photo_url`), otherwise a
 * circle with their first initial, also while the photo loads or if it fails. Next to the name it's decorative,
 * so the initial is hidden from screen readers; a photo is described ("Photo of Hana").
 */
export default function Avatar({ name, photo, size = "md", tone }: {
  name: string; photo?: string | null; size?: "sm" | "md" | "lg" | "xl"; tone?: Tone;
}) {
  const { t } = useTranslation();
  const src = usePhoto(photo);
  const [broken, setBroken] = useState<string | null>(null);
  const cls = `gavatar ${size}`;
  if (src && broken !== src) {
    return <img className={cls} src={src} alt={t("teamtrip.photoOf", { name })} decoding="async" onError={() => setBroken(src)} />;
  }
  return <span className={`${cls} ${tone ?? toneOf(name)}`} aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || "?"}</span>;
}
