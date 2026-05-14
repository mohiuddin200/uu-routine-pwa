# UU CSE Routine PWA

Mobile-first PWA for the Uttara University CSE Summer 26-1 Batch 67 offline routine.

## Run Locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173` from this folder.

## Data

The source PDF is stored at `assets/original-routine.pdf`. The app data was generated with:

```bash
python3 scripts/extract-routine.py
```

The current app intentionally keeps only Batch 67 sections from the PDF: `67 A`, `67 B`, `67 C`, and `67 D`.
