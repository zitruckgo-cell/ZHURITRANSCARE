/*
# Add BOL and POD numbers to deliveries

1. Modified Tables
- `deliveries` — add two auto-generated reference number columns:
  - `bol_number` (text, nullable) — Bill of Lading number, generated when a load is posted
  - `pod_number` (text, nullable) — Proof of Delivery number, generated when POD is submitted

2. Security
- No RLS policy changes needed; existing policies cover the new columns.
*/

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS bol_number text;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_number text;

CREATE INDEX IF NOT EXISTS idx_deliveries_bol_number ON deliveries(bol_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_pod_number ON deliveries(pod_number);
