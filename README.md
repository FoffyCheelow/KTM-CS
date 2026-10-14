# Community Studio Planner

A browser-based planning tool for the Community Studio.

The planner will show a fixed dirty workshop area and ten flexible workspace zones. Zones 1–10 together represent approximately 2,400 sq ft. Flexible space should be assigned using the smallest suitable group of adjacent zones for each activity.

## Community Studio Space Planner application

For a simple guide to downloading and opening the app on your own computer, read [START-HERE.md](START-HERE.md).

A working TypeScript web app for the Community Studio at Kentish Town Meanwhile. The interactive SVG uses the **actual supplied A101 architectural drawing**, with ten selectable whole zones, a separate fixed dirty workshop, columns, existing rooms and indicative exit routes. The supplied PDFs are available from the Studio guide.

## Run

Requires **Node.js 24 or newer** (uses built-in `node:sqlite`) and npm.

```bash
cd /workspace/KTM-CS
npm ci
npm run dev
```

The server listens on **port 3000**, on all interfaces. Change it with `PORT`. Use the existing checkout; each cloud task is already isolated and does not need a Git worktree.

```bash
npm run build       # TypeScript check and production bundle
npm start           # Serve the production bundle and API on port 3000
npm test            # Allocation, persistence, authentication, validation and race checks
npm run test:browser # Build, then four end-to-end Chromium checks against an isolated test database
```

Browser tests use `/usr/bin/chromium`. Set `CHROMIUM_PATH` to an installed Chromium executable on another machine. They start and stop their own server on port 3100 and never alter the working studio database. API tests use port 3198. No external services or API credentials are needed. Fonts are bundled locally.

## Use

- Choose a date, activity type, headcount and times. The initial clean-workshop proposal for 20 people preserves Zones **4, 5, 9, 10** and explicitly shows its **10.81 m² shortfall** against 100 m². Accept an offered adjoining zone to expand it; no automatic change is made to the preferred footprint.
- Click zones or focus them and press Enter/Space to select manually. A disconnected or unavailable group cannot become a reservation. Zoom, pan and reset controls sit above the plan.
- Switch to a five-person meeting to see the whole of **Zone 7** preferred when available. If it is occupied, another sufficient single zone is selected.
- **Save draft** persists a proposal without holding zones by default. **Request this space** creates a pending reservation. Pending and confirmed bookings hold zones and equipment, including setup and pack-down. Managers can change draft/pending reservation behaviour explicitly.
- Physical reservation and attendance are separate. By default everyone counts throughout setup, the activity and pack-down. For an overnight installation, specify the full space reservation plus a shorter attendance interval. This version supports one continuous attendance interval per booking; split separate visits into separate booking requests when necessary.
- Review the linked daily timeline and All bookings. Manager-only status actions can confirm, mark pending or cancel. Existing confirmed bookings are never moved by the planner.
- Print plan produces an allocation summary with selected zones, area, people, calculations and unresolved checks.

## Manager access and data

On first start, the server generates a private random password at `.data/manager-password` (permissions 0600). Retrieve it locally and use the lock icon to sign in. **Do not commit or share that file.** Alternatively set `STUDIO_MANAGER_PASSWORD` in the server environment. No default production password is embedded in the app. Sessions are HttpOnly, SameSite cookies and expire after eight hours or a server restart. Confirmation and configuration updates are protected on the server, including direct API calls.

Bookings, configuration, rule versions, area-at-save assumptions and the audit trail persist in `.data/studio.sqlite`. `STUDIO_DATA_DIR` changes the data directory. Back it up with the server stopped or a SQLite-consistent backup method. The first run seeds three clearly labelled **demo pending bookings on that day's London date**; these are illustrative, not actual reservations from the PDFs. Set `STUDIO_SEED=false` **before creating a fresh database** to start empty. Existing databases are never reseeded or reset by installation. Managers can cancel demo bookings through the UI.

Studio settings supports areas, unavailable zones, usable adjacency, preferred allocations, classification factors and approval references. The advanced editor also supports zone polygons, scale calibration, obstructions, protected route paths, shared equipment, per-zone limits, exact-combination limits, route-specific limits, incompatible activity pairs and source metadata. Geometry edits do not overwrite calculation areas. Changing rules is audited and flags future bookings for revalidation; their reservations and saved zones remain intact.

## Allocation and validation

The deterministic engine exhaustively examines the 1,023 nonempty subsets of Zones 1–10. It rejects unusable/disconnected groups and checks availability across the **entire buffered reservation**. Sufficient candidates are ranked by smallest zone count, preferences, compactness, excess area and a stable tie-break. Preferred proposals stay visible even when short of area, with valid extensions offered for explicit acceptance. When no sufficient group is available, reduced-headcount or later-time alternatives are offered only after running the same validations.

All areas use **sq ft × 0.09290304** internally. Zones 1–5 are provisionally 288 sq ft each; Zones 6–10 are 192 sq ft each, totalling 2,400 sq ft / 222.967296 m². The dirty workshop is a fixed 900 sq ft / 83.612736 m² provision. The approximate 300 sq ft studio remainder is not bookable. Occupancy estimates round down **after combining the activity's area**, not per zone.

Occupancy and equipment checks sweep each relevant interval boundary, so non-simultaneous bookings are not incorrectly added together. Staff, tutors and visitors count. Equipment stays reserved throughout setup and pack-down even when attendance is shorter. Confirmation reads and validates the latest state within a SQLite **BEGIN IMMEDIATE transaction**, preventing simultaneous confirmations from double-booking a zone or exceeding a shared limit. Rule saves reject stale versions. User-entered bookings and configuration are schema-validated on the server.

## Provisional information and operational review

The September 2026 use analysis and July 2026 A101 drawing are **preliminary references, not an approved fire strategy or surveyed zone schedule**. The plan retains the architectural footprint, but overlay polygons, scale, route locations, areas and equipment stocks require site verification.

The initial **unverified** reference factors are workshop 5, meeting 1, exhibition 1.5 and art gallery 5 m²/person. Meetings cannot use high-density assembly classifications. Minimum area, practical layout area and the indicative factor requirement remain separate; the largest governs the planning check. Per-zone limits are conservatively applied to the whole group headcount because the app does not assume how occupants distribute between zones.

Official sources are linked with edition, section, effective-date and verification metadata in Studio guide/settings. Live verification of GOV.UK and legislation.gov.uk was blocked by the workspace network policy. The supplied PDF's reference to a 2026 compilation is **not treated as proof that every amendment is in force**. No upcoming amendment is activated automatically.

Draft planning is available immediately. Confirmation stays blocked until a manager records approved studio and shared escape capacities, verifies the activity classification and records the site assessment/operational review reference. Dirty workshop confirmation also requires its approved limit. Record any applicable zone, combination, escape-route and equipment constraints. A booking's area result never establishes fire compliance, and a whole-zone reservation never authorises blocking a protected route.

Before operational use, verify the drawing and actual areas; usable boundaries and barriers; circulation and exits; the applicable Approved Document B Volume 2 edition, Fire Safety Order and relevant risk-assessment guidance; ventilation, welfare and access; practical layouts; equipment stocks; and the site-specific fire strategy. The larger course scenarios from the PDFs may exceed the studio's planning capacity and are deliberately shown with conflicts.

This is a working workspace app, not a public multi-tenant deployment. Before wider deployment, add HTTPS, organisational identity and authorisation, user-specific booking/privacy policies, monitored backups and an agreed operational assessment. Requesters currently share visibility of the studio's booking list; drafts are not private.

## Code map

- `shared/model.ts`: areas, geometry/configuration and reservation/attendance definitions.
- `shared/engine.ts`: connectivity, allocation, interval sweeps and validated alternatives.
- `shared/time.ts`: Europe/London conversion, nonexistent-time rejection and repeated-time choice.
- `server/schema.ts`: input validation and configuration constraints.
- `server/store.ts`: SQLite persistence, atomic confirmation, demo data and audit history.
- `server/index.ts`: authenticated manager API, sessions and application server.
- `client/`: responsive React planner, SVG plan, request form, guide and manager UI.
- `public/references/`: the supplied reference PDFs and brief.
- `tests/`: focused engine/API tests plus desktop/mobile browser workflows.
