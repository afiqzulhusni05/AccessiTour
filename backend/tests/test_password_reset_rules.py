"""Tests for "forgot password" links.

Run from the backend folder:  pytest -v
"""

import datetime as dt

from app.password_reset_rules import link_problem, new_token, reset_link, token_hash

NOW = dt.datetime(2026, 11, 24, 12, 0, tzinfo=dt.timezone.utc)


def test_only_a_hash_of_the_token_is_stored():
    token, hashed = new_token()
    assert hashed == token_hash(token) and token not in hashed and len(hashed) == 64
    assert new_token()[0] != token  # every link is different


def test_a_link_works_once_and_only_before_it_expires():
    later = NOW + dt.timedelta(minutes=30)
    assert link_problem(later, None, NOW) is None
    assert link_problem(later, NOW, NOW) is not None  # already used
    assert link_problem(NOW, None, NOW) is not None  # expired


def test_the_link_points_at_the_website():
    assert reset_link("https://accessitour.onrender.com/", "abc") == "https://accessitour.onrender.com/reset-password?token=abc"
