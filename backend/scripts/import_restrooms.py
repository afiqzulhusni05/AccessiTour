"""Load public restrooms from the national public restroom CSV (data.go.kr) into
the database, so the app can show the nearest ones without calling an outside API.

Run from the backend folder, with .venv active:

    python -m scripts.import_restrooms ~/Downloads/KC_CHILD_PBCTLT_FCLTY_LIST_2022.csv --dry-run
    python -m scripts.import_restrooms ~/Downloads/KC_CHILD_PBCTLT_FCLTY_LIST_2022.csv

Running it again replaces the whole restroom table with the file's contents.
Rows without a usable location are skipped and counted.
"""

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

# Korea's mainland and islands lie roughly inside this box
LAT_RANGE = (33.0, 38.7)
LNG_RANGE = (124.5, 132.0)


def number(raw: dict, column: str) -> int:
    value = (raw.get(column) or "").strip()
    try:
        return max(0, int(float(value)))
    except ValueError:
        return 0


def text(raw: dict, column: str, limit: int | None = None) -> str | None:
    value = (raw.get(column) or "").strip()
    if not value:
        return None
    return value[:limit] if limit else value


def parse_row(raw: dict) -> dict | None:
    """One CSV row as table fields, or None when it has no usable name or location."""
    name = text(raw, "FCLTY_NM", 200)
    source_id = text(raw, "ESNTL_ID", 40)
    try:
        lat = float(raw.get("FCLTY_LA") or "")
        lng = float(raw.get("FCLTY_LO") or "")
    except ValueError:
        return None
    if not name or not source_id:
        return None
    if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
        return None
    return dict(
        source_id=source_id,
        name=name,
        province=text(raw, "CTPRVN_NM", 50),
        district=text(raw, "SIGNGU_NM", 50),
        address=text(raw, "FCLTY_ROAD_NM_ADDR") or text(raw, "LNM_ADDR"),
        address_en=text(raw, "ADDR_ENG_NM"),
        latitude=lat,
        longitude=lng,
        phone=text(raw, "TEL_NO", 40),
        opening_hours=text(raw, "USE_TIME_CN", 200),
        managed_by=text(raw, "MANAGE_OFFM_NM", 200),
        # toilet stalls for disabled people (men's + women's)
        accessible_toilets=number(raw, "MALE_DSPSN_WTRCLS_CO") + number(raw, "FEMALE_DSPSN_WTRCLS_CO"),
        child_toilets=number(raw, "MALE_CHILD_WTRCLS_CO") + number(raw, "MALE_CHILD_UIL_CO")
        + number(raw, "FEMALE_CHILD_WTRCLS_CO"),
        has_nursing_room=(raw.get("NRSGRM_AT") or "").strip().upper() == "Y",
        data_updated=text(raw, "UPDT_DT", 8),
    )


def read_csv(path: Path) -> tuple[list[dict], int]:
    """Usable rows (one per source_id) and how many rows were skipped."""
    rows: dict[str, dict] = {}
    skipped = 0
    with path.open(encoding="utf-8-sig", newline="") as f:
        for raw in csv.DictReader(f):
            row = parse_row(raw)
            if row is None:
                skipped += 1
            else:
                rows[row["source_id"]] = row
    return list(rows.values()), skipped


def save(rows: list[dict]) -> None:
    # Imported here so --dry-run works without a database connection
    from sqlalchemy import delete, insert
    from sqlalchemy.engine import make_url

    from app.config import settings
    from app.database import SessionLocal
    from app.models import PublicRestroom

    print(f"Database: {make_url(settings.database_url).host}")
    with SessionLocal() as db:
        db.execute(delete(PublicRestroom))
        for start in range(0, len(rows), 1000):
            db.execute(insert(PublicRestroom), rows[start : start + 1000])
        db.commit()  # all or nothing


def main() -> None:
    parser = argparse.ArgumentParser(description="Load public restrooms from a CSV file.")
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="check the file only")
    args = parser.parse_args()

    path = args.csv_file.expanduser()
    if not path.exists():
        sys.exit(f"File not found: {path}")

    rows, skipped = read_csv(path)
    by_province = Counter(r["province"] for r in rows)
    accessible = sum(1 for r in rows if r["accessible_toilets"] > 0)
    print(f"{len(rows)} restrooms read from {path.name} ({skipped} rows skipped: no usable name or location)")
    print(f"  with an accessible toilet: {accessible}")
    for province in ("서울특별시", "부산광역시", "제주특별자치도"):
        print(f"  {province}: {by_province.get(province, 0)}")

    if args.dry_run:
        print("Dry run: nothing was saved.")
        return
    save(rows)
    print(f"Done: the restroom table now holds {len(rows)} restrooms.")


if __name__ == "__main__":
    main()
