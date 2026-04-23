// TODO: EDITORIAL REVIEW NEEDED
// The text below is a first draft — holding copy only.
// Jonathan to review and edit before this page goes live.
// Last worked on: 2026-04-23. Return to this when fresh.

"use client";

import { useRouter } from "next/navigation";

export default function AboutPage() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--ambo-border)",
        background: "var(--ambo-surface)",
        padding: "0 24px",
        height: 60,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            border: "1px solid var(--ambo-border)",
            background: "transparent",
            color: "var(--ambo-text-secondary)",
            borderRadius: 100,
            padding: "6px 14px",
            fontSize: 13,
            fontFamily: "var(--ambo-font-ui)",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ChevronLeft /> Back
        </button>
      </header>

      {/* Content */}
      <main style={{
        flex: 1,
        maxWidth: 680,
        width: "100%",
        margin: "0 auto",
        padding: "48px 32px 80px",
        boxSizing: "border-box",
      }}>
        <h1 style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: "clamp(26px, 5vw, 36px)",
          fontWeight: 400,
          color: "var(--ambo-text-primary)",
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
          marginBottom: 40,
        }}>
          Why Ambo is shaped this way
        </h1>

        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: 17,
          lineHeight: 1.75,
          color: "var(--ambo-text-primary)",
          letterSpacing: "0.01em",
        }}>
          <Prose>
            <p>
              A priest typically begins preparing his Sunday homily early in the
              week — Monday, Tuesday, Wednesday — when the readings are still
              fresh and there is time to sit with them in prayer. Ambo was
              built to accompany that time. Its shape follows the ancient
              practice of <em>Lectio Divina</em>: listening to the Word before
              responding to it, letting what God is saying emerge before
              deciding what to say. The app does not tell a priest what to
              preach. It makes space for him to hear.
            </p>

            <p>
              The app follows a single movement — Reflect, Write, Preach —
              because that is the real inner order of the task. It is not a
              productivity sequence. It is an attempt to honour the way homily
              preparation actually works when it goes well: first, the priest
              listens; then he discerns what must be said; then he prepares
              words that can be spoken aloud in worship.
            </p>

            <h2>Reflect</h2>

            <p>
              The first screen is designed to feel recollected rather than
              busy. The readings are primary. Everything else — the discernment
              prompts, the notes — responds to them. That hierarchy is
              deliberate. The Church is consistent on this: preparation for
              preaching should begin with the Scriptures, not with the
              preacher&rsquo;s own ideas about what he might say.
            </p>

            <blockquote>
              &ldquo;Preparation for preaching is so important a task that a
              prolonged time of study, prayer, reflection and pastoral
              creativity should be devoted to it.&rdquo;
              <cite>— Evangelii Gaudium, 145</cite>
            </blockquote>

            <p>
              The first question Ambo asks is intentionally singular:{" "}
              <em>What is the one thread I am being led to preach?</em> That is
              not a usability choice. It is a theological one. Pope Francis
              insists that the preacher&rsquo;s task is to identify the
              principal message that gives the text its structure and unity —
              not to accumulate as many interesting observations as possible.
              The secondary questions only open once that central thread has
              begun to take shape. They are there to test and deepen it, not
              to add to the pile.
            </p>

            <h2>Write</h2>

            <p>
              The writing screen keeps the thread quietly in view above the
              drafting space. That is all it does. There are no suggestions, no
              rewrite prompts, no sentence completions, and no automated
              analysis of what the priest has written. The homily belongs to
              the priest. The page exists to hold his words, not to compete
              with them.
            </p>

            <p>
              The Examine panel, which opens before the priest commits to the
              final text, is best understood as a pastoral examen of the
              homily — a set of quiet questions drawn from the Church&rsquo;s
              own teaching on preaching: Is this homily centred? Does it lead
              toward the Eucharist and mission? Does it proclaim grace, or only
              explain a text? These are not technical checks. They are the kind
              of questions a wise confessor might ask.
            </p>

            <h2>Preach</h2>

            <p>
              The final screen is restrained by design. Preparation has done
              its work. What remains should feel like readiness, not
              performance. A homily is part of the liturgical action — it
              belongs within worship, not alongside it as a separate display of
              skill or effort.
            </p>

            <h2>On artificial intelligence</h2>

            <p>
              Ambo uses no AI in the act of writing or composing the homily.
              That boundary is firm, and it is worth explaining why.
            </p>

            <blockquote>
              &ldquo;Generative AI can produce text, speech, images, and other
              advanced outputs that are usually associated with human beings.
              Yet, it must be understood for what it is: a tool, not a
              person.&rdquo;
              <cite>— Antiqua et Nova, 59</cite>
            </blockquote>

            <p>
              A priest&rsquo;s homily does not arise from language generation.
              It arises from ordination, prayer, pastoral responsibility, and
              love for a concrete community. No model can replicate that, and
              none should try. Whatever limited intelligence exists elsewhere in
              the product stays outside the priest&rsquo;s own act of
              composing — it may serve that work indirectly, but it does not
              perform it.
            </p>

            <h2>What the app is trying to protect</h2>

            <p>
              Ambo is trying to guard a few quiet goods that digital tools tend
              to erode: attention before God, simplicity of theme, pastoral
              honesty, and the confidence to preach in one&rsquo;s own voice.
              It is shaped to do less rather than more — not to impress, but to
              remove a few common obstacles. Scattered preparation. Too many
              possible directions. Drafts that lose their centre. The quiet
              pressure of an interface that turns preaching into performance.
            </p>

            <p>
              If it remains faithful to that restraint, Ambo can be what it set
              out to be: not a replacement for homiletic labour, but a faithful
              companion to it.
            </p>
          </Prose>
        </div>
      </main>
    </div>
  );
}

// Thin wrapper that applies heading + blockquote styles via a className
function Prose({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        .ambo-about h2 {
          font-family: var(--ambo-font-reading);
          font-size: 20px;
          font-weight: 500;
          color: var(--ambo-text-primary);
          margin: 48px 0 16px;
          letter-spacing: -0.01em;
        }
        .ambo-about p {
          margin: 0 0 24px;
        }
        .ambo-about blockquote {
          margin: 32px 0;
          padding: 20px 24px;
          border-left: 3px solid var(--ambo-accent);
          background: var(--ambo-surface);
          border-radius: 0 8px 8px 0;
          font-style: italic;
          color: var(--ambo-text-secondary);
          font-size: 16px;
          line-height: 1.7;
        }
        .ambo-about blockquote cite {
          display: block;
          margin-top: 10px;
          font-size: 13px;
          font-style: normal;
          font-family: var(--ambo-font-ui);
          color: var(--ambo-text-muted);
          letter-spacing: 0.02em;
        }
        @media (max-width: 600px) {
          .ambo-about blockquote {
            padding: 16px 18px;
          }
        }
      `}</style>
      <div className="ambo-about">{children}</div>
    </>
  );
}

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
