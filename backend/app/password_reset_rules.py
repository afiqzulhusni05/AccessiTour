"""Rules for "forgot password" links that don't need the database, so they can be tested on their own."""

import datetime as dt
import hashlib
import secrets

LINK_MINUTES = 30  # how long a link works
MAX_LINKS_PER_HOUR = 3  # per account, so nobody can flood someone's inbox


def new_token() -> tuple[str, str]:
    """(token for the email link, hash to store)."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def link_problem(expires_at: dt.datetime, used_at: dt.datetime | None, now: dt.datetime) -> str | None:
    if used_at is not None:
        return "This link has already been used. Ask for a new one."
    if now >= expires_at:
        return "This link has expired. Ask for a new one."
    return None


def reset_link(frontend_url: str, token: str) -> str:
    return f"{frontend_url.rstrip('/')}/reset-password?token={token}"
