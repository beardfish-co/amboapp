// Central readings loader with snapshot-first policy.
//
// Universalis' free JSONP serves a narrow sliding window around today:
// ~3 days of past lookback, ~9 days of future lookahead. Evangelizo's XML
// feed covers up to 30 days ahead. Our route layer rejects silent-redirect
// responses (404), so future dates outside the window surface as
// "not published yet" rather than silently returning today's readings.
//
// To make a priest's body of work durable, we snapshot the readings onto
// the homily row the first time we fetch them successfully. Subsequent
// loads prefer the snapshot, so historical homilies keep their original
// readings forever — independent of upstream uptime.

import { createClient } from "@/lib/supabase/client";
import type { ReadingsSource } from "@/lib/jurisdiction";

export interface Reading {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

export interface ReadingsPayload {
  date: string;
  number: number;
  dayName: string;
  source: ReadingsSource;
  readings: Reading[];
}

export type ReadingsStatus =
  | "snapshot"         // served from the homily's stored snapshot
  | "live"             // fresh from upstream (also written back to snapshot)
  | "not_published"    // upstream hasn't published readings for this date yet
  | "unavailable";     // network error / unexpected format

export interface ReadingsResult {
  payload: ReadingsPayload | null;
  status: ReadingsStatus;
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Load readings for a given date, preferring a stored snapshot.
 *
 * @param isoDate   Date in YYYY-MM-DD format.
 * @param homilyId  Optional — enables snapshot read/write for archival durability.
 * @param source    Which upstream adapter to use ("universalis" | "evangelizo").
 *                  Defaults to "universalis" for backwards compatibility.
 */
export async function loadReadings(
  isoDate: string,
  homilyId?: string | null,
  source: ReadingsSource = "universalis",
): Promise<ReadingsResult> {
  if (!isoDate) return { payload: null, status: "unavailable" };

  // 1. Snapshot lookup (homily-scoped).
  // The snapshot was written with whichever source was active at the time,
  // so historical homilies always show the same readings regardless of later
  // source changes. We only use the snapshot when the date matches exactly.
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
    const res = await fetch(
      `/api/readings?date=${isoToCompact(isoDate)}&source=${source}`,
    );
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
 * Pass `homilyId` to benefit from snapshot-first lookup.
 */
export async function loadDayName(
  isoDate: string,
  homilyId?: string | null,
  source: ReadingsSource = "universalis",
): Promise<string | null> {
  const { payload } = await loadReadings(isoDate, homilyId, source);
  return payload?.dayName ?? null;
}
