import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

const ROW = 36; // px, must match .wheel li height in styles.css
const pad = (n: number) => String(n).padStart(2, "0");

/** One scrolling column. The row resting in the middle band is the selected value. */
function Wheel({ count, value, label, onChange }: {
  count: number;
  value: number;
  label: string;
  onChange: (v: number) => void;
}) {
  const el = useRef<HTMLUListElement>(null);
  const settle = useRef<number>();

  // Follow value changes that didn't come from scrolling (first render, arrow keys, clicking a row).
  useEffect(() => {
    const list = el.current!;
    if (Math.round(list.scrollTop / ROW) !== value) list.scrollTo({ top: value * ROW });
  }, [value]);

  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const v = Math.min(count - 1, Math.max(0, Math.round(el.current!.scrollTop / ROW)));
      if (v !== value) onChange(v);
    }, 90);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    onChange((value + step + count) % count);
  };

  return (
    <ul
      ref={el} className="wheel" tabIndex={0} role="spinbutton" aria-label={label}
      aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={value} aria-valuetext={pad(value)}
      onScroll={onScroll} onKeyDown={onKey}
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={i === value ? "on" : ""} aria-hidden="true" onClick={() => onChange(i)}>{pad(i)}</li>
      ))}
    </ul>
  );
}

/** Scroll-wheel time picker (24-hour), value and onChange use "HH:MM". */
export default function TimeWheel({ value, label, onChange }: {
  value: string;
  label: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [h, m] = value.split(":").map(Number);
  return (
    <div className="timewheel" role="group" aria-label={label}>
      <Wheel count={24} value={h || 0} label={t("collab.hour")} onChange={(v) => onChange(`${pad(v)}:${pad(m || 0)}`)} />
      <span aria-hidden="true">:</span>
      <Wheel count={60} value={m || 0} label={t("collab.minute")} onChange={(v) => onChange(`${pad(h || 0)}:${pad(v)}`)} />
    </div>
  );
}
