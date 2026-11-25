import { useState, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

/**
 * A password box with a Show / Hide button, so people can check what they typed.
 * Takes the same props as <input>, apart from `type`.
 */
export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-field">
      <input {...props} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button" className="pw-toggle" aria-pressed={shown}
        aria-label={t(shown ? "auth.hidePassword" : "auth.showPassword")}
        onClick={() => setShown(!shown)}
      >
        {t(shown ? "auth.hide" : "auth.show")}
      </button>
    </span>
  );
}
