export const metadata = {
  title: "Terms of Use — Ambo",
};

export default function TermsPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--ambo-bg)",
      padding: "48px 24px 80px",
    }}>
      <div style={{
        maxWidth: 680,
        margin: "0 auto",
      }}>

        <a href="/" style={{
          display: "inline-block",
          marginBottom: 40,
          fontSize: 13,
          color: "var(--ambo-text-muted)",
          textDecoration: "none",
        }}>
          ← Back to Ambo
        </a>

        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--ambo-text-primary)",
          marginBottom: 8,
        }}>
          Terms of Use
        </h1>

        <p style={meta}>
          Last updated: April 2026
        </p>

        <Section title="What Ambo is">
          <p style={body}>
            Ambo is a homily preparation tool for Catholic priests. It provides a space to reflect on the Sunday and weekday readings, write homily drafts, and keep notes across the liturgical year. It is operated by <strong>[LEGAL_ENTITY_NAME]</strong>.
          </p>
          <p style={body}>
            Ambo is currently in beta. Access is by invitation only. Features may change, and the service may be updated or interrupted without prior notice during this period.
          </p>
        </Section>

        <Section title="Your account">
          <p style={body}>
            Access to Ambo is granted by invitation. You are responsible for keeping your sign-in email secure. You may not share your account or transfer access to another person.
          </p>
          <p style={body}>
            We reserve the right to suspend or remove access at our discretion, particularly if the service is misused or if the beta period concludes.
          </p>
        </Section>

        <Section title="Your content">
          <p style={body}>
            Everything you write in Ambo — homily drafts, discernment notes, seeds, reflections — belongs to you. We claim no ownership over your content and will never use it for any purpose other than displaying it back to you.
          </p>
          <p style={body}>
            You can export or delete your content at any time. If you delete your account, all your content is permanently removed.
          </p>
        </Section>

        <Section title="What Ambo does not do">
          <p style={body}>Ambo is designed with a clear boundary around what the tool does and does not do:</p>
          <ul style={list}>
            <li style={item}>Ambo does not write homilies. The Write view is a space for the priest to compose in his own voice. No AI-generated text is inserted into your homily at any point.</li>
            <li style={item}>Ambo does not tell you what to preach. The reflective prompts in the Reflect view are invitations to prayer and attention, not directions.</li>
            <li style={item}>Ambo does not share your content with other users or third parties. See our <a href="/privacy" style={link}>Privacy Policy</a> for full details.</li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p style={body}>
            Ambo is provided for personal homily preparation by Catholic priests. You agree not to use Ambo for any unlawful purpose, to attempt to access other users' data, or to interfere with the service or its infrastructure.
          </p>
        </Section>

        <Section title="Beta disclaimer">
          <p style={body}>
            Ambo is provided during its beta period on an "as is" basis. We make no warranties, express or implied, regarding the reliability, availability, or fitness of the service for any particular purpose. We are not liable for any loss of data, interruption of service, or other issues arising from use of the app during the beta period.
          </p>
          <p style={body}>
            That said, we take the care of your content seriously. We maintain regular database backups and will make every reasonable effort to protect your data.
          </p>
        </Section>

        <Section title="Your rights under GDPR">
          <p style={body}>
            If you are in the European Economic Area or the United Kingdom, you have rights regarding your personal data, including the right to access, correct, and delete it. Please see our <a href="/privacy" style={link}>Privacy Policy</a> for the full details, or contact us at <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a>.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p style={body}>
            We may update these terms from time to time. If we make significant changes, we will notify you by email before they take effect. Continued use of Ambo after changes take effect constitutes acceptance of the updated terms.
          </p>
        </Section>

        <Section title="Contact">
          <p style={body}>
            Questions about these terms: <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a>
          </p>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{
        fontSize: 17,
        fontWeight: 600,
        color: "var(--ambo-text-primary)",
        marginBottom: 12,
        marginTop: 40,
        letterSpacing: "-0.01em",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

const body: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.75,
  color: "var(--ambo-text-secondary)",
  marginBottom: 12,
};

const meta: React.CSSProperties = {
  fontSize: 13,
  color: "var(--ambo-text-muted)",
  marginBottom: 48,
};

const list: React.CSSProperties = {
  paddingLeft: 20,
  marginBottom: 12,
};

const item: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.75,
  color: "var(--ambo-text-secondary)",
  marginBottom: 6,
};

const link: React.CSSProperties = {
  color: "var(--ambo-accent)",
  textDecoration: "none",
};
