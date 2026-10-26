import { useTranslation } from "react-i18next";

/** Picks the Korean or romanized form of a guide's name (or bio) for the current UI language. */
export function useLocalized() {
  const { i18n } = useTranslation();
  return (en: string, ko: string) => (i18n.language === "ko" && ko ? ko : en);
}
