// Central readings loader with snapshot-first policy.
//
// Universalis' free JSONP serves a narrow sliding window around today:
// ~3 days of past lookback, ~9 days of future lookahead. Our route layer
// now rejects silent-redirect responses (404), so future dates outside
// the window surface as "not published yet" rather than silently returning
// today's readings.
//
// To make a priest's body of work durable, we snapshot the readings onto
// the homily row the first time we fetch them successfully. Subsequent
// loads prefer the snapshot, so historical homilies keep their original
// readings forever — independent of Universalis uptime.

import { createClient } from "@/lib/supabase/client";

export interface Reading {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

export interface ReadingsPayload {
  date: string;   // Universalis-formatted, e.g. "Sunday 26 April 2026"
  number: number; // YYYYMMDD as integer
  dayName: string;
  readings: Reading[];
}

export type ReadingsStatus =
  | "snapshot"         // served from the homily's stored snapshot
  | "live"             // fresh from Universalis (also written back to the snapshot)
  | "not_published"    // Universalis hasn't published readings for this date yet
  | "unavailable";     // network error / unexpected format

export interface ReadingsResult {
  payload: ReadingsPayload | null;
  status: ReadingsStatus;
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Load readings for a Sunday (or any date), preferring a stored snapshot.
 *
 * Caller may pass `homilyId` to opt in to snapshot semantics:
 *   - if the homily already has a snapshot for this date, return it (no network)
 *   - else live-fetch and — on success — persist the payload onto the homily
 *
 * When called without a homilyId (e.g. HomilyList name lookup), the helper
 * skips snapshot I/O entirely and just live-fetches.
 */
export async function loadReadings(
  isoDate: string,
  homilyId?: string | null,
): Promise<ReadingsResult> {
  if (!isoDate) return { payload: null, status: "unavailable" };

  // 1. Snapshot lookup (homily-scoped).
  if (homilyId) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("homilies")
        .select("readings_snapshot, readings_snapshot_date")
        .eq("id", homilyId)
        .maybeSingle();
      if (
        data?.readings_snapshot &&
        data.readings_snapshot_date === isoDate
      ) {
        return {
          payload: data.readings_snapshot as ReadingsPayload,
          status: "snapshot",
        };
      }
    } catch {
      // Snapshot lookup failure is non-fatal — fall through to live fetch.
    }
  }

  // 2. Live fetch.
  try {
    const res = await fetch(`/api/readings?date=${isoToCompact(isoDate)}`);
    if (res.status === 404) {
      return { payload: null, status: "not_published" };
    }
    if (!res.ok) {
      return { payload: null, status: "unavailable" };
    }
    const payload = (await res.json()) as ReadingsPayload;

    // 3. Persist to snapshot for archival durability.
    if (homilyId) {
      try {
        const supabase = createClient();
        await supabase
          .from("homilies")
          .update({
            readings_snapshot: payload,
            readings_snapshot_date: isoDate,
          })
          .eq("id", homilyId);
      } catch {
        // Snapshot write failure is non-fatal — the payload still renders.
      }
    }

    return { payload, status: "live" };
  } catch {
    return { payload: null, status: "unavailable" };
  }
}

/**
 * Fetches just the liturgical day name (e.g. "4th Sunday of Easter").
 * Pass `homilyId` to benefit from snapshot-first lookup — historical homilies
 * resolve instantly from their stored snapshot without a network call.
 */
export async function loadDayName(
  isoDate: string,
  homilyId?: string | null,
): Promise<string | null> {
  const { payload } = await loadReadings(isoDate, homilyId);
  return payload?.dayName ?? null;
}
