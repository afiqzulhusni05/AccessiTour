import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** One headline number. With `to`, the whole tile is a link to the list behind the number. */
export function Tile({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </>
  );
  return to ? <Link className="tile" to={to}>{body}</Link> : <div className="tile">{body}</div>;
}

/** Shown on a list that a dashboard link has narrowed down, with the way back to the full list. */
export function FilterNote({ label, all }: { label: string; all: string }) {
  const { t } = useTranslation();
  return <p className="filternote">{t("dash.showing", { what: label })} <Link to={all}>{t("dash.showAll")}</Link></p>;
}

/** A titled card, optionally with a "View all" link. */
export function Panel({ title, more, moreLabel, span, children }: {
  title: string; more?: string; moreLabel?: string; span?: boolean; children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={"panel" + (span ? " span" : "")}>
      <header>
        <h2>{title}</h2>
        {more && <Link to={more}>{moreLabel ?? t("dash.viewAll")}</Link>}
      </header>
      {children}
    </section>
  );
}

/** Counts as labelled horizontal bars, largest first. */
export function Bars({ rows }: { rows: { label: string; value: number; to?: string }[] }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  return (
    <ul className="bars">
      {sorted.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}`}>
          {r.to ? <Link to={r.to}>{r.label}</Link> : <span>{r.label}</span>}
          <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <b>{r.value}</b>
        </li>
      ))}
    </ul>
  );
}

/** Loads something once and renders loading / error text until it arrives. */
export function Loading({ failed }: { failed: boolean }) {
  const { t } = useTranslation();
  return failed
    ? <p role="alert" className="error">{t("dash.error")}</p>
    : <p role="status">{t("dash.loading")}</p>;
}
