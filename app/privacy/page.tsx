export const metadata = {
  title: "Privacy Policy — Ambo",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>

        <p style={meta}>
          Last updated: April 2026
        </p>

        <Section title="Who we are">
          <p style={body}>
            Ambo is operated by <strong>[LEGAL_ENTITY_NAME]</strong> ("we", "us", "our"). If you have any questions about this policy or how we handle your data, please contact us at <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a>.
          </p>
        </Section>

        <Section title="What data we collect">
          <p style={body}>We collect and store only what is necessary to provide the service:</p>
          <ul style={list}>
            <li style={item}><strong>Email address</strong> — used to identify your account and send sign-in codes. We do not send marketing email.</li>
            <li style={item}><strong>Homily content</strong> — the text you write in Ambo, including discernment notes, seed thoughts, and final homily drafts.</li>
            <li style={item}><strong>Reflection notes</strong> — any notes you keep alongside the readings in the Reflect view.</li>
            <li style={item}><strong>Readings data</strong> — a snapshot of the liturgical readings associated with each homily, taken from public lectionary sources.</li>
          </ul>
          <p style={body}>We do not collect payment information, location data, device identifiers, or any data beyond what is described above.</p>
        </Section>

        <Section title="How we use your data">
          <p style={body}>Your data is used solely to provide Ambo to you. Specifically:</p>
          <ul style={list}>
            <li style={item}>To display your homilies and notes when you sign in.</li>
            <li style={item}>To generate the reflective prompts shown alongside each day's readings. These prompts are generated using an AI service (Anthropic). Only the text of the liturgical readings — which is public data — is sent to this service. Your personal notes and homily content are never sent to any AI service.</li>
            <li style={item}>To maintain your account and authenticate your sign-ins.</li>
          </ul>
          <p style={body}>We do not use your data for advertising, profiling, or any purpose other than operating the service. We do not sell your data to any third party.</p>
        </Section>

        <Section title="Who can see your data">
          <p style={body}>
            Your homilies and notes are private. They are only visible to you. Access controls at the database level enforce this — no other user of Ambo can read your content, and we do not routinely access individual priests' homily data.
          </p>
          <p style={body}>
            We may access data in exceptional circumstances: if required by law, or if investigating a serious technical fault. In those cases we will act with discretion and inform you where legally permitted.
          </p>
        </Section>

        <Section title="Third-party services">
          <p style={body}>We use the following third-party services to operate Ambo:</p>
          <ul style={list}>
            <li style={item}><strong>Supabase</strong> — database and authentication. Your data is stored on Supabase infrastructure. Supabase is GDPR-compliant and acts as a data processor on our behalf.</li>
            <li style={item}><strong>Anthropic</strong> — AI model used to generate reflective prompts. Only public lectionary text is sent; no personal data is transmitted.</li>
            <li style={item}><strong>Vercel</strong> — hosting for the Ambo web application.</li>
          </ul>
          <p style={body}>Each of these providers operates under data processing agreements consistent with GDPR requirements.</p>
        </Section>

        <Section title="Your rights under GDPR">
          <p style={body}>If you are located in the European Economic Area or the United Kingdom, you have the following rights:</p>
          <ul style={list}>
            <li style={item}><strong>Access</strong> — you can request a copy of the data we hold about you.</li>
            <li style={item}><strong>Rectification</strong> — you can ask us to correct inaccurate data.</li>
            <li style={item}><strong>Erasure</strong> — you can request that we delete your account and all associated data.</li>
            <li style={item}><strong>Portability</strong> — you can request your homily content in a portable format.</li>
            <li style={item}><strong>Restriction</strong> — you can ask us to restrict processing of your data in certain circumstances.</li>
            <li style={item}><strong>Objection</strong> — you can object to certain types of processing.</li>
          </ul>
          <p style={body}>
            To exercise any of these rights, contact us at <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a>. We will respond within 30 days. You also have the right to lodge a complaint with your national data protection authority.
          </p>
        </Section>

        <Section title="Account deletion">
          <p style={body}>
            You can delete your account and all associated data from within the app at any time via Account Settings. Deletion is permanent and irreversible. If you encounter any difficulty, contact us at <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a> and we will complete the deletion manually within 7 days.
          </p>
        </Section>

        <Section title="Data retention">
          <p style={body}>
            We keep your data for as long as your account is active. If you delete your account, all data is deleted promptly. We do not retain backups of deleted accounts beyond 30 days.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p style={body}>
            If we make significant changes to this policy, we will notify you by email before the changes take effect. The date at the top of this page reflects when the policy was last updated.
          </p>
        </Section>

        <Section title="Contact">
          <p style={body}>
            For any privacy-related questions or requests: <a href="mailto:[PRIVACY_EMAIL]" style={link}>[PRIVACY_EMAIL]</a>
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
