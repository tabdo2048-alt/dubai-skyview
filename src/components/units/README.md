# Unit views

`UnitGallery` owns image selection, missing-image handling and the accessible enlargement dialog.
Unit lookup and sales availability rules live in `src/lib/unit-types.ts` and are shared by routes and offer generation.

Before the refactor, the full production source was preserved at GitHub branch
`backup/pre-unit-refactor-20260907` (commit `5b9090565661631c4f827b603c43f0f1d298da7b`).
To recover it without overwriting later work, create a new branch from that backup and compare the changes.
The database change is additive; reverting the frontend does not require deleting new columns or data.

The PDF QR target still uses `VITE_OFFER_QR_URL`, falling back to the configured WhatsApp contact.
Do not replace it with a unit URL automatically.
