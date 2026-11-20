import { useTranslation } from "react-i18next";
import { LANGUAGES } from "./i18n";

/** Language picker for the top bar. Each language is written in itself, so people can find their own. */
export default function LanguageMenu({ onDark = false }: { onDark?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <label className={"langmenu" + (onDark ? " dark" : "")}>
      <span className="sr-only">{t("language")}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
      </svg>
      <select value={i18n.resolvedLanguage} onChange={(e) => i18n.changeLanguage(e.target.value)}>
        {LANGUAGES.map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
      </select>
    </label>
  );
}
