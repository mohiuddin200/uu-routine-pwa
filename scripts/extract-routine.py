#!/usr/bin/env python3
"""Extract the UU CSE Summer 26-1 routine PDF into app-ready JSON.

The source PDF stores the timetable as positioned text rather than a
semantic table. This script uses the stable column coordinates from the
PDF to pair each course code with its teacher and room.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = PROJECT_ROOT / "assets" / "original-routine.pdf"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "routine-data.js"

SLOTS = [
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


def parse_pdf(pdf_path: Path) -> dict:
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

            for slot_number, (x, start, end) in enumerate(SLOTS, start=1):
                course = read_at(items, x, y - 23.8, 4.0)
                teacher = read_at(items, x, y - 3.4, 4.0)
                room = read_at(items, x, y + 17.0, 4.5)

                if not (course or teacher or room):
                    continue

                entry_id = "-".join(
                    [
                        batch.lower().replace(" & ", "-").replace(" ", "-"),
                        "friday",
                        f"{slot_number:02d}",
                    ]
                )

                entries.append(
                    {
                        "id": entry_id,
                        "page": page_number,
                        "program": normalize_program(batch),
                        "batch": batch,
                        "day": "Friday",
                        "slot": slot_number,
                        "start": start,
                        "end": end,
                        "course": course,
                        "teacher": "" if teacher == "." else teacher,
                        "room": room,
                    }
                )

    entries.sort(key=lambda item: (batch_sort_key(item["batch"]), item["slot"]))

    return {
        "meta": {
            "title": "UU CSE Routine",
            "term": "Summer 26-1",
            "source": "Batch-Wise BSc Evening and MSc Offline Class Routine Summer 26-1.pdf",
            "department": "Department of CSE, Uttara University",
            "scope": "Batch 67 sections only",
            "generatedFromPages": len(reader.pages),
            "availableDays": ["Friday"],
        },
        "days": ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "slots": [
            {"slot": index, "start": start, "end": end}
            for index, (_, start, end) in enumerate(SLOTS, start=1)
        ],
        "batches": sorted(batches, key=batch_sort_key),
        "entries": entries,
    }


def main() -> int:
    pdf_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_PDF
    output_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_OUTPUT

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    routine = parse_pdf(pdf_path)
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
