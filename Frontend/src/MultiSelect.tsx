import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

/**
 * A searchable menu for picking several values: the choices so far show as removable chips, and typing narrows
 * the list. The value stays a plain array of option ids, the same shape the chip groups use.
 * Keyboard: type to search, ↓ ↑ to move, Enter to tick or untick, Backspace on an empty box removes the last
 * choice, Escape closes.
 */
export default function MultiSelect({ label, options, value, onChange, optionLabel }: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  optionLabel: (id: string) => string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  const shown = options.filter((o) => optionLabel(o).toLowerCase().includes(text.trim().toLowerCase()));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);

  // close when the pointer or the keyboard focus goes somewhere else
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("focusin", away); };
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (shown.length) setActive((active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // never submits the surrounding form
      if (open && shown[active]) { toggle(shown[active]); setText(""); }
      else setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="msel" ref={box}>
      <span className="fieldlabel" id={`${id}-label`}>{label}</span>
      <div className={"msel-control" + (open ? " open" : "")} onClick={() => { input.current?.focus(); setOpen(true); }}>
        {value.map((o) => (
          <span key={o} className="msel-chip">
            {optionLabel(o)}
            <button type="button" aria-label={t("msel.remove", { item: optionLabel(o) })} onClick={(e) => { e.stopPropagation(); toggle(o); }}>×</button>
          </span>
        ))}
        <input
          ref={input} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
          aria-labelledby={`${id}-label`} aria-activedescendant={open && shown[active] ? `${id}-${shown[active]}` : undefined}
          value={text} placeholder={value.length ? "" : t("msel.search")}
          onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
      </div>
      {open && (
        <ul className="msel-list" role="listbox" id={`${id}-list`} aria-multiselectable="true" aria-labelledby={`${id}-label`}>
          {shown.length === 0 && <li className="muted" role="presentation">{t("msel.none")}</li>}
          {shown.map((o, i) => (
            <li
              key={o} id={`${id}-${o}`} role="option" aria-selected={value.includes(o)} className={i === active ? "active" : ""}
              onPointerDown={(e) => e.preventDefault() /* keep the typing focus in the box */}
              onClick={() => { toggle(o); setActive(i); }}
            >
              <span aria-hidden="true">{value.includes(o) ? "✓" : ""}</span>{optionLabel(o)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
