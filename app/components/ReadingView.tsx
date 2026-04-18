"use client";

import { useEffect, useState } from "react";

interface Reading {
  title: string;
  reference: string;
  text: string;
}

interface LiturgicalDay {
  day: string;
  season: string;
  readings: Reading[];
}

// Placeholder liturgical data — in production this pulls from Universalis API
// Attribution required: Text from Universalis (universalis.com)
const getTodayReadings = (): LiturgicalDay => {
  const today = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[today.getDay()];

  return {
    day: `${dayName}, ${today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    season: "Easter Season",
    readings: [
      {
        title: "First Reading",
        reference: "Acts 5:27-32, 40-41",
        text: "The high priest questioned the apostles, and Peter with the apostles replied: 'We must obey God rather than men. The God of our ancestors raised Jesus, whom you had killed by hanging on a tree. God exalted him at his right hand as leader and saviour to grant Israel repentance and forgiveness of sins. We are witnesses of these things, as is the Holy Spirit whom God has given to those who obey him.' The Sanhedrin had them flogged, ordered them to stop speaking in the name of Jesus, and dismissed them. So they left the presence of the Sanhedrin, rejoicing that they had been found worthy to suffer dishonour for the sake of the name.",
      },
      {
        title: "Psalm",
        reference: "Psalm 30",
        text: "I will praise you, Lord, you have rescued me\n and have not let my enemies rejoice over me.\n O Lord, you have raised my soul from the dead,\n restored me to life from those who sink into the grave.\n\nSing psalms to the Lord, you who love him,\n give thanks to his holy name.\n His anger lasts a moment; his favour all through life.\n At night there are tears, but joy comes with dawn.",
      },
      {
        title: "Gospel",
        reference: "John 21:1-14",
        text: "Jesus showed himself again to the disciples. It was by the Sea of Tiberias, and it happened like this: Simon Peter, Thomas called the Twin, Nathanael from Cana in Galilee, the sons of Zebedee and two more of his disciples were together. Simon Peter said, 'I'm going fishing.' They replied, 'We'll come with you.' They went out and got into the boat but caught nothing that night.\n\nIt was light by now and there stood Jesus on the shore, though the disciples did not realise that it was Jesus. Jesus called out, 'Have you caught anything, friends?' And when they answered, 'No,' he said, 'Throw the net to the right of the boat and you'll find something.' So they dropped the net, and there were so many fish that they could not haul it in.",
      },
    ],
  };
};

export default function ReadingView() {
  const [liturgy, setLiturgy] = useState<LiturgicalDay | null>(null);
  const [expanded, setExpanded] = useState<number | null>(2); // Gospel open by default

  useEffect(() => {
    setLiturgy(getTodayReadings());
  }, []);

  if (!liturgy) return null;

  return (
    <div className="view-fade" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 80px" }}>
      {/* Day header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ambo-accent)",
          margin: "0 0 6px",
        }}>
          {liturgy.season}
        </p>
        <h2 style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--ambo-text-primary)",
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          {liturgy.day}
        </h2>
      </div>

      {/* Readings */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {liturgy.readings.map((reading, i) => (
          <div
            key={i}
            className="glass-card"
            style={{ overflow: "hidden", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            {/* Header row */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 22px",
            }}>
              <div>
                <p style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--ambo-text-muted)",
                  marginBottom: 3,
                }}>
                  {reading.title}
                </p>
                <p style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--ambo-text-primary)",
                }}>
                  {reading.reference}
                </p>
              </div>
              <ChevronIcon open={expanded === i} />
            </div>

            {/* Text */}
            {expanded === i && (
              <div style={{ padding: "0 22px 24px" }}>
                <div className="ambo-divider" style={{ marginBottom: 20 }} />
                <p style={{
                  margin: 0,
                  fontSize: 16,
                  lineHeight: 1.8,
                  color: "var(--ambo-text-primary)",
                  fontStyle: reading.title === "Psalm" ? "italic" : "normal",
                  whiteSpace: "pre-line",
                }}>
                  {reading.text}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Attribution */}
      <p style={{
        marginTop: 32,
        fontSize: 11,
        color: "var(--ambo-text-muted)",
        textAlign: "center",
        letterSpacing: "0.02em",
      }}>
        Scripture texts from{" "}
        <a
          href="https://universalis.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ambo-accent)", textDecoration: "none" }}
        >
          Universalis
        </a>
      </p>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ambo-text-muted)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
        flexShrink: 0,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
