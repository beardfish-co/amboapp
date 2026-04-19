// Shared icon components. All 13-14px at native size, stroke-based,
// stroke="currentColor" so they inherit color from the surrounding element.

export function StackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="4" rx="1" />
      <rect x="3" y="9" width="14" height="4" rx="1" />
      <rect x="3" y="15" width="14" height="2.5" rx="1" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5a2 2 0 0 1 2 2v11" />
      <path d="M16 4h-5a2 2 0 0 0-2 2v11" />
      <path d="M4 4v13h5" />
      <path d="M16 4v13h-5" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="12" rx="2" />
      <path d="M3 9h14" />
      <path d="M7 3v4M13 3v4" />
    </svg>
  );
}

// NoteIcon — small folded page with a corner turned. "A jotting."
export function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M12 3v4h4" />
      <path d="M7 11h6M7 14h4" />
    </svg>
  );
}

// ExamineIcon — a downward/inward gaze: a small eye with the lid mostly lowered.
// For the "examine of conscience" — a last quiet inward look, not surveillance.
export function ExamineIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11c2-3.5 5-5 7-5s5 1.5 7 5" />
      <path d="M6.5 10.5c.8 1.5 2 2.5 3.5 2.5s2.7-1 3.5-2.5" />
      <circle cx="10" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
