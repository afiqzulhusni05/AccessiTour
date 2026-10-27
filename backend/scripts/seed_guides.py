"""Load sample guides from a CSV file into the database.

Run from the backend folder, with .venv active:

    python -m scripts.seed_guides data/sample_guides.csv --dry-run
    python -m scripts.seed_guides data/sample_guides.csv

Options:
    --dry-run     Check the file only. Nothing is saved.
    --days 60     How many days of availability to generate from today.
    --password    Login password for newly created guide accounts.

Running it again is safe: guides are matched by email and updated, not
duplicated. If any row has a mistake, nothing is saved.
"""

import argparse
import csv
import datetime as dt
import random
import sys
from dataclasses import dataclass
from pathlib import Path

from app.enums import (
    AccessibilityExperience,
    Attribute,
    Gender,
    Language,
    Region,
    TransportOption,
)

COLUMNS = [
    "full_name",
    "email",
    "gender",
    "description",
    "languages",
    "regions",
    "attributes",
    "accessibility_experience",
    "transport_options",
    "max_group_size",
    "verified",
    "rating_average",
    "rating_count",
    "micro_hourly_rate",
    "micro_min_hours",
    "micro_max_hours",
    "full_day_rate",
]

# Working hours used when generating availability: (start hour, end hour)
AVAILABILITY_PATTERNS = [(9, 18), (10, 19), (9, 13), (13, 18), (10, 17)]
CHANCE_FREE_ON_A_DAY = 0.7


class RowError(Exception):
    pass


@dataclass
class GuideRow:
    line: int
    full_name: str
    email: str
    gender: Gender
    description: str | None
    languages: list[str]
    regions: list[str]
    attributes: list[str]
    accessibility_experience: list[str]
    transport_options: list[str]
    max_group_size: int
    verified: bool
    rating_average: float
    rating_count: int
    micro_hourly_rate: int | None
    micro_min_hours: int | None
    micro_max_hours: int | None
    full_day_rate: int | None


# ---------- Reading and checking the CSV ----------


def text(raw: dict, column: str) -> str:
    value = raw.get(column)
    return value.strip() if isinstance(value, str) else ""


def parse_list(raw: dict, column: str, enum_cls) -> list[str]:
    items = [item.strip() for item in text(raw, column).split(",") if item.strip()]
    allowed = [member.value for member in enum_cls]
    # Accept any capitalisation ("busan", "Busan") and store the official spelling
    official = {value.lower(): value for value in allowed}
    wrong = [item for item in items if item.lower() not in official]
    if wrong:
        raise RowError(
            f"{column}: {', '.join(wrong)} is not allowed "
            f"(allowed: {', '.join(allowed)})"
        )
    return list(dict.fromkeys(official[item.lower()] for item in items))


def parse_int(raw: dict, column: str, required: bool, minimum: int = 0) -> int | None:
    value = text(raw, column)
    if value == "":
        if required:
            raise RowError(f"{column} is required")
        return None
    try:
        number = int(float(value))
    except ValueError:
        raise RowError(f"{column} must be a whole number, got '{value}'")
    if number < minimum:
        raise RowError(f"{column} must be at least {minimum}")
    return number


def parse_float(raw: dict, column: str, low: float, high: float) -> float:
    value = text(raw, column) or "0"
    try:
        number = float(value)
    except ValueError:
        raise RowError(f"{column} must be a number, got '{value}'")
    if not low <= number <= high:
        raise RowError(f"{column} must be between {low} and {high}")
    return number


def parse_bool(raw: dict, column: str) -> bool:
    value = text(raw, column).upper()
    if value in ("TRUE", "YES", "1"):
        return True
    if value in ("FALSE", "NO", "0", ""):
        return False
    raise RowError(f"{column} must be TRUE or FALSE, got '{value}'")


def parse_row(line: int, raw: dict) -> GuideRow:
    full_name = text(raw, "full_name")
    if not full_name:
        raise RowError("full_name is required")

    email = text(raw, "email").lower()
    if "@" not in email:
        raise RowError(f"email looks wrong: '{email}'")

    gender_value = text(raw, "gender").upper()
    if gender_value not in [g.value for g in Gender]:
        raise RowError(f"gender must be MALE or FEMALE, got '{gender_value}'")

    languages = parse_list(raw, "languages", Language)
    if not languages:
        raise RowError("languages needs at least one language")

    regions = parse_list(raw, "regions", Region)
    if not regions:
        raise RowError("regions needs at least one region")

    transport = parse_list(raw, "transport_options", TransportOption)
    if TransportOption.PUBLIC_TRANSIT.value not in transport:
        transport.insert(0, TransportOption.PUBLIC_TRANSIT.value)

    hourly = parse_int(raw, "micro_hourly_rate", required=False, minimum=1)
    min_hours = parse_int(raw, "micro_min_hours", required=False, minimum=1)
    max_hours = parse_int(raw, "micro_max_hours", required=False, minimum=1)
    micro_values = [hourly, min_hours, max_hours]
    if any(v is not None for v in micro_values) and None in micro_values:
        raise RowError(
            "for MICRO, fill in all three of micro_hourly_rate, micro_min_hours "
            "and micro_max_hours, or leave all three empty"
        )
    if min_hours is not None and min_hours > max_hours:
        raise RowError("micro_min_hours cannot be more than micro_max_hours")

    full_day_rate = parse_int(raw, "full_day_rate", required=False, minimum=1)
    if hourly is None and full_day_rate is None:
        raise RowError("the guide must offer MICRO, FULL_DAY or both")

    description = text(raw, "description") or None

    return GuideRow(
        line=line,
        full_name=full_name,
        email=email,
        gender=Gender(gender_value),
        description=description,
        languages=languages,
        regions=regions,
        attributes=parse_list(raw, "attributes", Attribute),
        accessibility_experience=parse_list(
            raw, "accessibility_experience", AccessibilityExperience
        ),
        transport_options=transport,
        max_group_size=parse_int(raw, "max_group_size", required=True, minimum=1),
        verified=parse_bool(raw, "verified"),
        rating_average=parse_float(raw, "rating_average", 0, 5),
        rating_count=parse_int(raw, "rating_count", required=False, minimum=0) or 0,
        micro_hourly_rate=hourly,
        micro_min_hours=min_hours,
        micro_max_hours=max_hours,
        full_day_rate=full_day_rate,
    )


def read_csv(path: Path) -> tuple[list[GuideRow], list[str]]:
    rows: list[GuideRow] = []
    errors: list[str] = []
    seen_emails: set[str] = set()

    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            return [], [f"Missing columns: {', '.join(missing)}"]

        for line, raw in enumerate(reader, start=2):
            if not any(isinstance(v, str) and v.strip() for v in raw.values()):
                continue  # skip empty rows
            try:
                guide = parse_row(line, raw)
            except RowError as error:
                errors.append(f"Row {line}: {error}")
                continue
            if guide.email in seen_emails:
                errors.append(f"Row {line}: email {guide.email} appears twice")
                continue
            seen_emails.add(guide.email)
            rows.append(guide)

    return rows, errors


# ---------- Availability ----------


def generate_availability(
    email: str, days: int, start: dt.date
) -> list[tuple[dt.date, dt.time, dt.time]]:
    # Seeded by email, so the same guide gets the same schedule every run
    rng = random.Random(email)
    slots = []
    for offset in range(days):
        day = start + dt.timedelta(days=offset)
        if rng.random() < CHANCE_FREE_ON_A_DAY:
            start_hour, end_hour = rng.choice(AVAILABILITY_PATTERNS)
            slots.append((day, dt.time(start_hour), dt.time(end_hour)))
    return slots


# ---------- Saving to the database ----------


def save(rows: list[GuideRow], days: int, password: str) -> tuple[int, int]:
    # Imported here so --dry-run works without a database connection
    from sqlalchemy import delete, select
    from sqlalchemy.engine import make_url

    from app.config import settings
    from app.database import SessionLocal
    from app.enums import ServiceType
    from app.models import Guide, GuideAvailability, GuideService, User, UserRole
    from app.security import hash_password

    print(f"Database: {make_url(settings.database_url).host}")

    today = dt.date.today()
    hashed_password = hash_password(password)
    created = updated = 0

    with SessionLocal() as db:
        for row in rows:
            user = db.scalar(select(User).where(User.email == row.email))
            if user is None:
                user = User(
                    email=row.email,
                    hashed_password=hashed_password,
                    full_name=row.full_name,
                    role=UserRole.GUIDE,
                )
                db.add(user)
                db.flush()
                created += 1
            else:
                if user.role != UserRole.GUIDE:
                    raise SystemExit(
                        f"Row {row.line}: {row.email} already exists as a "
                        f"{user.role.value}. Nothing was saved."
                    )
                user.full_name = row.full_name
                updated += 1

            guide = db.scalar(select(Guide).where(Guide.user_id == user.id))
            if guide is None:
                guide = Guide(user_id=user.id)
                db.add(guide)

            guide.gender = row.gender
            guide.description = row.description
            guide.languages = row.languages
            guide.regions = row.regions
            guide.attributes = row.attributes
            guide.accessibility_experience = row.accessibility_experience
            guide.transport_options = row.transport_options
            guide.max_group_size = row.max_group_size
            guide.verified = row.verified
            guide.rating_average = row.rating_average
            guide.rating_count = row.rating_count
            db.flush()

            db.execute(delete(GuideService).where(GuideService.guide_id == guide.id))
            if row.micro_hourly_rate is not None:
                db.add(
                    GuideService(
                        guide_id=guide.id,
                        service_type=ServiceType.MICRO,
                        hourly_rate=row.micro_hourly_rate,
                        min_hours=row.micro_min_hours,
                        max_hours=row.micro_max_hours,
                    )
                )
            if row.full_day_rate is not None:
                db.add(
                    GuideService(
                        guide_id=guide.id,
                        service_type=ServiceType.FULL_DAY,
                        daily_rate=row.full_day_rate,
                    )
                )

            db.execute(
                delete(GuideAvailability).where(
                    GuideAvailability.guide_id == guide.id,
                    GuideAvailability.date >= today,
                )
            )
            for day, start_time, end_time in generate_availability(row.email, days, today):
                db.add(
                    GuideAvailability(
                        guide_id=guide.id,
                        date=day,
                        start_time=start_time,
                        end_time=end_time,
                    )
                )

        db.commit()

    return created, updated


# ---------- Command line ----------


def main() -> None:
    parser = argparse.ArgumentParser(description="Load sample guides from a CSV file.")
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="check the file only")
    parser.add_argument("--days", type=int, default=60, help="days of availability")
    parser.add_argument("--password", default="guide12345", help="password for new guides")
    args = parser.parse_args()

    if not args.csv_file.exists():
        sys.exit(f"File not found: {args.csv_file}")

    rows, errors = read_csv(args.csv_file)
    if errors:
        print("Problems found, nothing was saved:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)

    print(f"{len(rows)} guides read from {args.csv_file}:")
    for row in rows:
        services = []
        if row.micro_hourly_rate is not None:
            services.append(f"MICRO {row.micro_hourly_rate}/h")
        if row.full_day_rate is not None:
            services.append(f"FULL_DAY {row.full_day_rate}/day")
        print(
            f"  {row.full_name:<12} {','.join(row.regions):<12} "
            f"{','.join(row.languages):<10} {' + '.join(services)}"
        )

    if args.dry_run:
        print("Dry run: the file is valid. Nothing was saved.")
        return

    created, updated = save(rows, args.days, args.password)
    print(
        f"Done: {created} guides created, {updated} updated, "
        f"{args.days} days of availability generated."
    )
    if created:
        print(f"New guides can log in with their email and password '{args.password}'.")


if __name__ == "__main__":
    main()
