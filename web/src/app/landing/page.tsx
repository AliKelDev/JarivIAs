import Link from "next/link";
import styles from "./landing.module.css";

export const metadata = {
  title: "JarivIAs — Meet Alik, your AI chief of staff",
  description:
    "Alik reads your inbox, manages your calendar, drafts your emails, and remembers your preferences — so you can focus on what matters.",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <span className={styles.navBrand}>JarivIAs</span>
        <Link href="/login" className={styles.navCta}>
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Early access</p>
          <h1 className={styles.headline}>
            Meet Alik.
            <br />
            <span className={styles.headlineAccent}>Your AI chief of staff.</span>
          </h1>
          <p className={styles.subheadline}>
            Alik connects to your Gmail and Google Calendar, handles your email
            drafts, reschedules meetings, gives you a morning briefing — and
            remembers your preferences session to session.
            <br />
            <br />
            Tell her once. She doesn&apos;t forget.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/login" className={styles.primaryCta}>
              Get early access
            </Link>
            <a href="#how-it-works" className={styles.secondaryCta}>
              See how it works
            </a>
          </div>
        </div>

        {/* Mockup / preview card */}
        <div className={styles.heroCard}>
          <div className={styles.chatBubbleAssistant}>
            Good morning. You have 3 meetings today — the 10 am with Serena moved
            to 2 pm per her request. I&apos;ve flagged two emails that need replies
            before noon. Want me to draft them?
          </div>
          <div className={styles.chatBubbleUser}>Yeah, draft both please.</div>
          <div className={styles.chatBubbleAssistant}>
            Done. Draft ready for Serena (re: Q2 roadmap) and for Mehdi (re:
            partnership follow-up). Both are in your Gmail drafts — review and
            send when ready.
          </div>
          <div className={styles.chatMeta}>
            <span className={styles.chatMetaBadge}>2 drafts saved</span>
            <span className={styles.chatMetaBadge}>Calendar updated</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>What Alik can do</h2>
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>✉</div>
            <h3 className={styles.featureTitle}>Email, handled</h3>
            <p className={styles.featureBody}>
              Alik reads your inbox, drafts replies in your voice, and saves
              them directly to Gmail. You review and send — or let her work
              autonomously on low-stakes mail.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📅</div>
            <h3 className={styles.featureTitle}>Calendar, managed</h3>
            <p className={styles.featureBody}>
              Ask Alik to reschedule a meeting, find a free slot, or give you
              a digest of what&apos;s ahead. She keeps your calendar coherent
              while you focus on work.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🧠</div>
            <h3 className={styles.featureTitle}>Memory that sticks</h3>
            <p className={styles.featureBody}>
              Alik remembers your preferences, important contacts, and working
              style across every session. No re-explaining your context every
              time you open a chat.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>☀</div>
            <h3 className={styles.featureTitle}>Morning briefing</h3>
            <p className={styles.featureBody}>
              One tap. Alik surfaces your calendar, flags important emails, and
              suggests your two most important priorities for the day — every
              morning.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚙</div>
            <h3 className={styles.featureTitle}>Your level of autonomy</h3>
            <p className={styles.featureBody}>
              Supervised, delegated, or autonomous — you set how much Alik does
              on her own. Start cautious, expand as trust builds. You&apos;re
              always in control.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔒</div>
            <h3 className={styles.featureTitle}>Your data, your access</h3>
            <p className={styles.featureBody}>
              OAuth only. Alik reads what you authorize, nothing else. We aim
              to minimize any third-party data storage of your emails or calendar
              content.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howItWorks} id="how-it-works">
        <h2 className={styles.sectionTitle}>Up and running in three steps</h2>
        <div className={styles.stepsGrid}>
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>1</span>
            <h3 className={styles.stepTitle}>Connect Google</h3>
            <p className={styles.stepBody}>
              Link your Gmail and Google Calendar with one OAuth flow. Takes
              30 seconds.
            </p>
          </div>
          <div className={styles.stepConnector} />
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>2</span>
            <h3 className={styles.stepTitle}>Set your profile</h3>
            <p className={styles.stepBody}>
              Tell Alik who you are and how you work. She uses this to shape
              every response.
            </p>
          </div>
          <div className={styles.stepConnector} />
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>3</span>
            <h3 className={styles.stepTitle}>Start delegating</h3>
            <p className={styles.stepBody}>
              Open the dashboard and ask Alik anything. She&apos;ll ask when
              she needs to and act when she can.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className={styles.bottomCta}>
        <div className={styles.bottomCtaInner}>
          <h2 className={styles.bottomCtaTitle}>
            Built for founders, operators, and anyone who does too many things.
          </h2>
          <p className={styles.bottomCtaBody}>
            JarivIAs is in early access. Request an invite and be among the
            first to work with Alik.
          </p>
          <Link href="/login" className={styles.primaryCta}>
            Request early access
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>JarivIAs &copy; 2026</span>
        <Link href="/login" className={styles.footerLink}>
          Sign in
        </Link>
      </footer>
    </div>
  );
}
