#!/usr/bin/env python3
"""Extract the UU CSE Summer 26-1 routine PDFs into app-ready JSON.

The source PDFs store the timetable as positioned text rather than a
semantic table. This script uses the stable column coordinates from the
PDFs to pair each course code with its teacher and room.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OFFLINE_PDF = PROJECT_ROOT / "assets" / "original-routine.pdf"
DEFAULT_ONLINE_PDF = PROJECT_ROOT / "docs" / "online-class.pdf"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "routine-data.js"

DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

OFFLINE_SLOTS = [
    (122.4, "08:00", "09:00"),
    (199.2, "09:00", "10:00"),
    (275.8, "10:00", "11:00"),
    (352.6, "11:00", "12:00"),
    (429.4, "12:00", "13:00"),
    (506.1, "14:00", "15:00"),
    (582.9, "15:00", "16:00"),
    (659.7, "16:00", "17:00"),
    (736.3, "17:00", "18:00"),
    (813.1, "18:00", "19:00"),
    (889.9, "19:00", "20:00"),
    (966.7, "20:00", "21:00"),
]

ALL_TIME_SLOTS = [(start, end) for _, start, end in OFFLINE_SLOTS] + [("21:00", "22:00")]
TIME_SLOT_INDEX = {time_range: index for index, time_range in enumerate(ALL_TIME_SLOTS, start=1)}

ONLINE_SLOTS = [
    ("Monday", 122.4, "18:00", "19:00"),
    ("Monday", 199.2, "19:00", "20:00"),
    ("Monday", 275.8, "20:00", "21:00"),
    ("Monday", 352.6, "21:00", "22:00"),
    ("Tuesday", 429.4, "18:00", "19:00"),
    ("Tuesday", 506.1, "19:00", "20:00"),
    ("Tuesday", 582.9, "20:00", "21:00"),
    ("Tuesday", 659.7, "21:00", "22:00"),
    ("Thursday", 736.3, "18:00", "19:00"),
    ("Thursday", 813.1, "19:00", "20:00"),
    ("Thursday", 889.9, "20:00", "21:00"),
    ("Thursday", 966.7, "21:00", "22:00"),
]

BATCH_PATTERN = re.compile(r"^(\d{2}(?:\s*&\s*\d{2})?\s+(?:[A-F]|MSc)|EEE)$")
TARGET_BATCH_PATTERN = re.compile(r"^67\s+[A-F]$")


def normalize_program(batch: str) -> str:
    return "MSc" if "MSc" in batch else "BSc Evening"


def batch_sort_key(batch: str) -> tuple[int, str]:
    match = re.match(r"^(\d{2})", batch)
    return (int(match.group(1)) if match else 999, batch)


def extract_items(page) -> list[dict[str, float | str]]:
    items: list[dict[str, float | str]] = []

    def visitor(text, cm, tm, font_dict, font_size):
        value = text.strip()
        if value:
            items.append({"x": float(tm[4]), "y": float(tm[5]), "text": value})

    page.extract_text(visitor_text=visitor)
    return items


def read_at(items, x: float, y: float, tolerance: float) -> str:
    matches = [
        item
        for item in items
        if abs(float(item["x"]) - x) < 8 and abs(float(item["y"]) - y) < tolerance
    ]
    return " ".join(str(item["text"]) for item in sorted(matches, key=lambda item: float(item["x"])))


def read_room_at(items, x: float, batch_y: float) -> str:
    lines = []
    for offset in (7.7, 17.0):
        line = read_at(items, x, batch_y + offset, 4.5)
        if line and line not in lines:
            lines.append(line)
    return " ".join(lines)


def make_entry_id(batch: str, day: str, slot_number: int) -> str:
    return "-".join(
        [
            batch.lower().replace(" & ", "-").replace(" ", "-"),
            day.lower(),
            f"{slot_number:02d}",
        ]
    )


def source_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def extract_offline_entries(pdf_path: Path) -> tuple[list[dict], set[str], int]:
    reader = PdfReader(str(pdf_path))
    entries = []
    batches: set[str] = set()

    for page_number, page in enumerate(reader.pages, start=1):
        items = extract_items(page)
        labels = [
            item
            for item in items
            if float(item["x"]) < 85
            and BATCH_PATTERN.match(str(item["text"]))
            and item["text"] != "EEE"
        ]

        for label in labels:
            batch = str(label["text"])
            if not TARGET_BATCH_PATTERN.match(batch):
                continue

            batches.add(batch)
            y = float(label["y"])

            for slot_number, (x, start, end) in enumerate(OFFLINE_SLOTS, start=1):
                time_slot = TIME_SLOT_INDEX[(start, end)]
                course = read_at(items, x, y - 23.8, 4.0)
                teacher = read_at(items, x, y - 3.4, 4.0)
                room = read_room_at(items, x, y)

                if not (course or teacher or room):
                    continue

                entries.append(
                    {
                        "id": make_entry_id(batch, "Friday", slot_number),
                        "page": page_number,
                        "mode": "Offline",
                        "program": normalize_program(batch),
                        "batch": batch,
                        "day": "Friday",
                        "slot": time_slot,
                        "sourceSlot": slot_number,
                        "start": start,
                        "end": end,
                        "course": course,
                        "teacher": "" if teacher == "." else teacher,
                        "room": room,
                    }
                )

    return entries, batches, len(reader.pages)


def extract_online_entries(pdf_path: Path) -> tuple[list[dict], set[str], int]:
    reader = PdfReader(str(pdf_path))
    entries = []
    batches: set[str] = set()

    for page_number, page in enumerate(reader.pages, start=1):
        items = extract_items(page)
        labels = [
            item
            for item in items
            if float(item["x"]) < 85
            and BATCH_PATTERN.match(str(item["text"]))
            and TARGET_BATCH_PATTERN.match(str(item["text"]))
        ]

        for label in labels:
            batch = str(label["text"])
            batches.add(batch)
            y = float(label["y"])

            for slot_number, (day, x, start, end) in enumerate(ONLINE_SLOTS, start=1):
                day_slot = ((slot_number - 1) % 4) + 1
                time_slot = TIME_SLOT_INDEX[(start, end)]
                course = read_at(items, x, y - 23.8, 4.0)
                teacher = read_at(items, x, y - 3.4, 4.0)
                room = read_room_at(items, x, y)

                if not (course or teacher or room):
                    continue

                entries.append(
                    {
                        "id": make_entry_id(batch, day, day_slot),
                        "page": page_number,
                        "mode": "Online",
                        "program": normalize_program(batch),
                        "batch": batch,
                        "day": day,
                        "slot": time_slot,
                        "sourceSlot": day_slot,
                        "start": start,
                        "end": end,
                        "course": course,
                        "teacher": "" if teacher == "." else teacher,
                        "room": room,
                    }
                )

    return entries, batches, len(reader.pages)


def parse_pdfs(offline_pdf_path: Path, online_pdf_path: Path) -> dict:
    entries = []
    batches: set[str] = set()
    sources = []

    offline_entries, offline_batches, offline_pages = extract_offline_entries(offline_pdf_path)
    entries.extend(offline_entries)
    batches.update(offline_batches)
    sources.append({"mode": "Offline", "path": source_path(offline_pdf_path), "pages": offline_pages})

    if online_pdf_path.exists():
        online_entries, online_batches, online_pages = extract_online_entries(online_pdf_path)
        entries.extend(online_entries)
        batches.update(online_batches)
        sources.append({"mode": "Online", "path": source_path(online_pdf_path), "pages": online_pages})

    entries.sort(
        key=lambda item: (
            DAYS.index(item["day"]),
            batch_sort_key(item["batch"]),
            item["start"],
            item["end"],
        )
    )
    available_days = [day for day in DAYS if any(entry["day"] == day for entry in entries)]

    return {
        "meta": {
            "title": "UU CSE Routine",
            "term": "Summer 26-1",
            "source": "Batch-Wise BSc Evening and MSc Offline/Online Class Routine Summer 26-1 PDFs",
            "sources": sources,
            "department": "Department of CSE, Uttara University",
            "scope": "Batch 67 sections only",
            "generatedFromPages": sum(source["pages"] for source in sources),
            "availableDays": available_days,
        },
        "days": DAYS,
        "slots": [
            {"slot": index, "start": start, "end": end}
            for index, (start, end) in enumerate(ALL_TIME_SLOTS, start=1)
        ],
        "batches": sorted(batches, key=batch_sort_key),
        "entries": entries,
    }


def main() -> int:
    offline_pdf_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OFFLINE_PDF
    output_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_OUTPUT
    online_pdf_path = DEFAULT_ONLINE_PDF

    if not offline_pdf_path.exists():
        print(f"PDF not found: {offline_pdf_path}", file=sys.stderr)
        return 1

    routine = parse_pdfs(offline_pdf_path, online_pdf_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "window.ROUTINE_DATA = "
        + json.dumps(routine, indent=2, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(routine['entries'])} entries to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
