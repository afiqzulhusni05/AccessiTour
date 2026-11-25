"""Sends email through SMTP (e.g. a Gmail account with an app password).
When SMTP isn't configured, the message is written to the server log instead."""

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("uvicorn.error")


def send_mail(to: str, subject: str, body: str) -> None:
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        log.warning("SMTP is not set up, so this email was not sent.\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
        return
    msg = EmailMessage()
    msg["From"] = settings.mail_from or settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        # runs after the response was sent, so the only place to report it is the log
        log.error("Sending email to %s failed: %s", to, e)
