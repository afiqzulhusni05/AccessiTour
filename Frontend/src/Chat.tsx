import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Comment, Role } from "./types";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// How many messages this viewer has already seen, kept per itinerary so the badge survives a reload.
const seenKey = (id: number, role: Role | null) => `chat-seen-${id}-${role}`;
const readSeen = (id: number, role: Role | null) => {
  try { return Number(localStorage.getItem(seenKey(id, role))) || 0; } catch { return 0; }
};

/**
 * Tourist-guide chat about the whole trip. Shows an icon in the top bar (with an unread count)
 * that opens the chat window. New messages arrive with the itinerary poll.
 */
export default function Chat({ itineraryId, messages, role, other, busy, onSend }: {
  itineraryId: number;
  messages: Comment[];
  role: Role | null; // null = looking on (admin): no sending, and nobody is "You"
  other: string; // who the viewer is talking to
  busy: boolean;
  onSend: (body: string) => Promise<boolean>; // true when the server accepted it
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(itineraryId, role));
  const [text, setText] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const unread = role ? messages.slice(seen).filter((m) => m.author !== role).length : 0;
  const title = role ? t("collab.chatWith", { who: other }) : t("collab.chat");

  useEffect(() => {
    if (!open) return;
    setSeen(messages.length);
    try { localStorage.setItem(seenKey(itineraryId, role), String(messages.length)); } catch { /* private mode */ }
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [open, messages.length, itineraryId, role]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && (await onSend(text.trim()))) setText("");
  };

  const slot = document.getElementById("top-actions");
  const label = unread ? t("collab.chatUnread", { count: unread }) : t("collab.chat");

  return (
    <>
      {slot && createPortal(
        <button type="button" ref={toggle} className="ghost iconbtn" aria-label={label} title={label}
          aria-expanded={open} aria-controls="chat-window" onClick={() => (open ? close() : setOpen(true))}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.7A8.4 8.4 0 1 1 21 11.5z" />
          </svg>
          {unread > 0 && <span className="badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
        </button>,
        slot,
      )}

      {open && (
        <div id="chat-window" className="chatwin" role="dialog" aria-label={title}
          onKeyDown={(e) => e.key === "Escape" && close()}>
          <header>
            <h2>{title}</h2>
            <button type="button" className="ghost small" onClick={close} aria-label={t("collab.chatClose")}>✕</button>
          </header>
          <ol className="chatlog" ref={log} role="log" aria-label={t("collab.chat")} tabIndex={0}>
            {messages.length === 0 && <li className="hint">{t("collab.chatEmpty")}</li>}
            {messages.map((m, i) => (
              <li key={i} className={m.author === role ? "mine" : ""}>
                <small>{m.author === role ? t("collab.you") : role ? other : t(`collab.role.${m.author}`)} · {clock(m.created_at)}</small>
                {m.body}
              </li>
            ))}
          </ol>
          {role && <form className="commentform" onSubmit={submit}>
            <input type="text" ref={input} value={text} onChange={(e) => setText(e.target.value)}
              aria-label={t("collab.chatInput")} placeholder={t("collab.chatInput")} />
            <button type="submit" className="primary" disabled={busy || !text.trim()}>{t("collab.send")}</button>
          </form>}
        </div>
      )}
    </>
  );
}
