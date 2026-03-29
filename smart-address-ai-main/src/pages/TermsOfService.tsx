import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LEGAL_ENTITY } from "@/lib/legalEntity";
import { Link } from "react-router-dom";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-10">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-24">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Legal</p>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: <span className="text-foreground">{LEGAL_ENTITY.lastUpdated}</span>. These terms apply to the
            website and address-processing service offered under the name &quot;{LEGAL_ENTITY.tradingName}&quot;
            (&quot;Service&quot;) by {LEGAL_ENTITY.companyName}.
          </p>

          <Section title="1. Who we are">
            <p>
              The Service is operated by <span className="text-foreground">{LEGAL_ENTITY.companyName}</span> (company
              number{" "}
              <a
                href={`https://find-and-update.company-information.service.gov.uk/company/${LEGAL_ENTITY.companyNumber}`}
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {LEGAL_ENTITY.companyNumber}
              </a>
              ) trading as &quot;{LEGAL_ENTITY.tradingName}&quot; (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
            </p>
            <p>
              Registered office: <span className="text-foreground">{LEGAL_ENTITY.registeredOffice}</span>.
            </p>
          </Section>

          <Section title="2. The Service">
            <p>
              We provide tools (including web and API-based flows) to parse, split, and structure UK address text into
              fields you can use in your own systems. Output is generated algorithmically. We may change, suspend, or
              discontinue features where reasonably necessary for security, compliance, or operations.
            </p>
          </Section>

          <Section title="3. Not professional or legal advice">
            <p>
              Output may be incomplete or incorrect. You remain responsible for how you use it, including compliance with
              data protection law, insurance, anti–money laundering, and any sector rules. The Service does not replace
              human review where that is required.
            </p>
          </Section>

          <Section title="4. Accounts and authentication">
            <p>
              Access may require an account via our authentication provider (currently Clerk). You must provide accurate
              details, keep credentials secure, and notify us at {LEGAL_ENTITY.contactEmail} if you suspect unauthorised access. We may
              suspend accounts that appear compromised or abusive.
            </p>
          </Section>

          <Section title="5. Plans, billing, and credits">
            <p>
              Free and paid plans, usage limits (&quot;credits&quot; or equivalent), and billing are described on our Pricing page
              and managed through our payment processor (currently Stripe) where applicable. Prices may change for new
              purchases; existing subscriptions are governed by Stripe&apos;s billing cycle and any notice we give where
              required. Taxes may apply.
            </p>
            <p>
              Unless we agree otherwise in writing, fees are non-refundable except where mandatory consumer rights apply or
              where we choose to offer a goodwill credit or refund at our discretion.
            </p>
          </Section>

          <Section title="6. Fair use and acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>use the Service unlawfully or to infringe others&apos; rights;</li>
              <li>attempt to probe, disrupt, or overload our systems (including bypassing rate limits or security);</li>
              <li>resell or redistribute the Service in a way that competes with our offering without permission;</li>
              <li>submit content you do not have the right to process, or that contains malware.</li>
            </ul>
            <p>We may throttle, suspend, or terminate access if we reasonably believe these rules are broken.</p>
          </Section>

          <Section title="7. Your data and ours">
            <p>
              You retain rights in the address text and other content you submit. We process it to deliver the Service as
              described in our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              . Our branding, software, and documentation remain ours. You receive a non-exclusive, non-transferable right
              to use the Service during your subscription or permitted free use, subject to these terms.
            </p>
          </Section>

          <Section title="8. Third-party services">
            <p>
              The Service relies on subprocessors (for example hosting, authentication, and payments). Their availability
              and terms may affect the Service. We are not responsible for third-party failures beyond our reasonable control.
              Provider lists and legal terms may change — for authentication, see{" "}
              <a href="https://clerk.com/legal/subprocessors" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Clerk&apos;s subprocessors
              </a>{" "}
              and{" "}
              <a href="https://clerk.com/legal/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Clerk&apos;s Privacy Policy
              </a>
              ; for payments, see{" "}
              <a href="https://stripe.com/legal" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Stripe&apos;s legal hub
              </a>
              .
            </p>
          </Section>

          <Section title="9. Disclaimers">
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent permitted by
              applicable law, we disclaim implied warranties of satisfactory quality, fitness for a particular purpose, and
              non-infringement.
            </p>
          </Section>

          <Section title="10. Limitation of liability">
            <p>
              Nothing in these terms excludes or limits liability that cannot be excluded or limited under English law
              (including death or personal injury caused by negligence, or fraud). Subject to that:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>we are not liable for any indirect, consequential, or special loss, or for loss of profit, data, or goodwill;</li>
              <li>
                our total aggregate liability arising out of or in connection with the Service in any twelve-month period
                is limited to the greater of (a) the fees you paid us for the Service in that period or (b) one hundred
                pounds sterling (£100), except where a different mandatory rule applies.
              </li>
            </ul>
            <p>If you are a consumer, some of these limits may not apply to you; your statutory rights are unaffected.</p>
          </Section>

          <Section title="11. Termination">
            <p>
              You may stop using the Service at any time. We may suspend or end access for breach of these terms, non-payment
              where applicable, or extended inactivity where reasonable. Provisions that by nature should survive (including
              liability limits where enforceable) will survive termination.
            </p>
          </Section>

          <Section title="12. Changes">
            <p>
              We may update these terms from time to time. We will post the new version on this page and update the &quot;Last
              updated&quot; date. Where changes are material and we have your email, we may also notify you. Continued use after
              changes take effect constitutes acceptance of the revised terms, except where the law requires a different
              process.
            </p>
          </Section>

          <Section title="13. Governing law and jurisdiction">
            <p>
              These terms are governed by the law of England and Wales. The courts of England and Wales have exclusive
              jurisdiction, except that if you are a consumer resident in Scotland or Northern Ireland you may also bring
              proceedings in your home jurisdiction where the law allows.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              Questions about these terms:{" "}
              <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="text-primary hover:underline">
                {LEGAL_ENTITY.contactEmail}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;
