// ── Lectionary jurisdiction layer ─────────────────────────────────────────────
//
// Different bishops' conferences have approved different English translations
// for use at Mass. The passages (pericopes) are identical worldwide; only the
// translation differs. Ambo uses a lectionary_family value stored in user
// metadata to select the appropriate readings source for each user.
//
// Sources currently active:
//   universalis  →  Jerusalem Bible  (Ireland, Australia, NZ, and most of the
//                                    English-speaking world outside North America)
//   evangelizo   →  New American Bible  (United States)
//
// Sources coming once permissions are confirmed:
//   gb_esv, ca_nrsv, india_esv

export type LectionaryFamily =
  | "je_jerusalem"   // Ireland, Australia, New Zealand — Jerusalem Bible
  | "us_nab"         // United States — New American Bible
  | "gb_esv"         // England, Wales, Scotland — ESV-CE (coming)
  | "ca_nrsv"        // Canada — NRSV (coming)
  | "india_esv"      // India — ESV-CE + Grail Psalms (coming)
  | "unverified";    // Other / not yet mapped

export type ReadingsSource = "universalis" | "evangelizo";

// Map a lectionary family to the source adapter that serves it.
export function sourceForFamily(family: LectionaryFamily): ReadingsSource {
  switch (family) {
    case "us_nab":
      return "evangelizo";
    // gb_esv, ca_nrsv, india_esv will get their own adapters once permissions
    // are in place. For now they fall back to Jerusalem Bible via Universalis —
    // same passages, different translation. The UI flags this clearly.
    default:
      return "universalis";
  }
}

// Human-readable label shown in the jurisdiction picker and settings.
export interface JurisdictionOption {
  family: LectionaryFamily;
  label: string;
  sublabel: string;
  available: boolean;   // false = coming soon, shown greyed out
}

export const JURISDICTION_OPTIONS: JurisdictionOption[] = [
  {
    family: "je_jerusalem",
    label: "Ireland, Australia & New Zealand",
    sublabel: "Jerusalem Bible",
    available: true,
  },
  {
    family: "us_nab",
    label: "United States",
    sublabel: "New American Bible",
    available: true,
  },
  {
    family: "gb_esv",
    label: "England, Wales & Scotland",
    sublabel: "Jerusalem Bible — same readings, different approved translation",
    available: true,
  },
  {
    family: "ca_nrsv",
    label: "Canada",
    sublabel: "Jerusalem Bible — same readings, different approved translation",
    available: true,
  },
  {
    family: "india_esv",
    label: "India",
    sublabel: "Jerusalem Bible — same readings, different approved translation",
    available: true,
  },
  {
    family: "unverified",
    label: "Other territory",
    sublabel: "Jerusalem Bible (approximate)",
    available: true,
  },
];

// Attribution text shown in the app footer, keyed by source.
export const SOURCE_ATTRIBUTION: Record<ReadingsSource, { name: string; url: string }> = {
  universalis: { name: "Universalis", url: "https://universalis.com" },
  evangelizo:  { name: "Evangelizo", url: "https://feed.evangelizo.org" },
};
