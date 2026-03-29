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

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-24">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Legal</p>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: <span className="text-foreground">{LEGAL_ENTITY.lastUpdated}</span>. This policy describes how we handle
            personal data when you use Smart Address UK (&quot;we&quot;, &quot;us&quot;). Use it alongside our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            .
          </p>
          <p className="mt-4 rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground leading-relaxed">
            We are not a law firm. If you need certainty for regulated processing or large-scale B2B contracts, obtain
            advice from a qualified professional and complete a Data Processing Agreement where required.
          </p>

          <Section title="1. Who controls your data">
            <p>
              The data controller for your use of Smart Address UK is{" "}
              <span className="text-foreground">{LEGAL_ENTITY.companyName}</span> (company number{" "}
              <a
                href={`https://find-and-update.company-information.service.gov.uk/company/${LEGAL_ENTITY.companyNumber}`}
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {LEGAL_ENTITY.companyNumber}
              </a>
              ), trading as &quot;{LEGAL_ENTITY.tradingName}&quot;. Registered office:{" "}
              <span className="text-foreground">{LEGAL_ENTITY.registeredOffice}</span>.
            </p>
            <p>
              Where you sign in with Clerk, we choose Clerk as a <span className="text-foreground">processor</span> on our
              instructions for authentication and organisation features; Clerk also publishes its own legal terms for how it
              runs its platform. End-user questions about data we hold should come to us first at{" "}
              <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="text-primary hover:underline">
                {LEGAL_ENTITY.contactEmail}
              </a>{" "}
              — consistent with how Clerk describes &quot;Customer Data&quot; in its documentation.
            </p>
            <p>
              Contact:{" "}
              <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="text-primary hover:underline">
                {LEGAL_ENTITY.contactEmail}
              </a>
              .
            </p>
            {LEGAL_ENTITY.icoRegistrationNumber.trim() ? (
              <p>
                We are registered with the UK Information Commissioner&apos;s Office (ICO) and have paid the data
                protection fee required under UK law. Registration reference:{" "}
                <span className="text-foreground">{LEGAL_ENTITY.icoRegistrationNumber.trim()}</span>. You can verify fee-paying
                organisations on the{" "}
                <a
                  href="https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ICO register of fee payers
                </a>
                .
              </p>
            ) : null}
          </Section>

          <Section title="2. What we process">
            <p>Depending on how you use the Service, this may include:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground">Account data</span> — for example name, email, and identifiers from our
                authentication provider (Clerk).
              </li>
              <li>
                <span className="text-foreground">Organisation / team data</span> — workspace names and membership where you
                use shared features.
              </li>
              <li>
                <span className="text-foreground">Usage and billing data</span> — approximate usage metering, plan type, and
                payment-related records processed by Stripe.
              </li>
              <li>
                <span className="text-foreground">Content you submit</span> — address text and similar input you send for
                processing. The Service is designed to process requests and return results without storing your address
                payloads in our application database for later retrieval. Do not rely on this as a guarantee if your hosting
                provider logs request bodies—check your host&apos;s logging settings (see &quot;How to verify&quot; below).
              </li>
              <li>
                <span className="text-foreground">Support communications</span> — emails or messages you send us.
              </li>
            </ul>
          </Section>

          <Section title="3. Purposes and legal bases (UK GDPR)">
            <p>We process data to provide the Service, secure it, bill paid plans, comply with law, and support you. Typical bases:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground">Contract</span> — delivering the Service you sign up for.
              </li>
              <li>
                <span className="text-foreground">Legitimate interests</span> — security, abuse prevention, and limited
                operational metrics (we do not load third-party marketing or analytics scripts on our marketing site as
                currently built—verify in your browser if you add tools later).
              </li>
              <li>
                <span className="text-foreground">Legal obligation</span> — where required (for example tax or regulatory
                requests).
              </li>
            </ul>
          </Section>

          <Section title="4. Subprocessors">
            <p>
              We use trusted providers. They (and their own suppliers) may process data in the UK, EEA, US, or elsewhere,
              using safeguards such as the UK / EU GDPR, standard contractual clauses, or certifications recognised for
              transfers (for example Clerk describes use of the EU-US Data Privacy Framework in its{" "}
              <a href="https://clerk.com/legal/dpa" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Data Processing Addendum
              </a>
              ).
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground">Clerk, Inc.</span> — authentication, sessions, organisations, and related
                infrastructure. Clerk maintains a current list of its own subprocessors (e.g. cloud hosting, email/SMS,
                monitoring) at{" "}
                <a href="https://clerk.com/legal/subprocessors" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  clerk.com/legal/subprocessors
                </a>
                . Clerk&apos;s role and your rights as a business customer are also covered in its{" "}
                <a href="https://clerk.com/legal/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>{" "}
                and DPA; sign the DPA in the Clerk dashboard if your contracts require it.
              </li>
              <li>
                <span className="text-foreground">Stripe, Inc.</span> — payments and billing. See{" "}
                <a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Stripe&apos;s Privacy Policy
                </a>
                ,{" "}
                <a href="https://stripe.com/legal/service-providers" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  service providers (subprocessors)
                </a>
                , and the wider{" "}
                <a href="https://stripe.com/legal" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  legal hub
                </a>
                .
              </li>
              <li>
                <span className="text-foreground">Our hosts</span> (e.g. website and API hosting) — see your service
                provider&apos;s privacy notice for the regions where machines run and what they log.
              </li>
            </ul>
          </Section>

          <Section title="5. Retention">
            <p>Typical periods (refine with your accountant and host settings):</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-foreground">Account and organisation data (Clerk)</span> — while your account exists
                and for a short period after closure, per Clerk&apos;s configuration and policies.
              </li>
              <li>
                <span className="text-foreground">Billing records (Stripe)</span> — retained as described by Stripe for
                payment processing, tax, and disputes (often several years). See{" "}
                <a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  stripe.com/privacy
                </a>{" "}
                and related notices.
              </li>
              <li>
                <span className="text-foreground">Usage metering (our API)</span> — monthly address counts and related
                settings are stored in our usage database to enforce plan limits and for support; historical months may remain
                on disk until deleted as part of a defined cleanup policy.
              </li>
              <li>
                <span className="text-foreground">Support emails</span> — for up to approximately{" "}
                <span className="text-foreground">twenty-four (24) months</span> after the last message in a thread (or
                sooner if deleted as part of mailbox housekeeping), unless we need to keep them longer for legal,
                regulatory, or serious dispute reasons.
              </li>
              <li>
                <span className="text-foreground">Admin support actions</span> — records of goodwill credit adjustments may
                be kept to evidence what we changed and why.
              </li>
            </ul>
            <p>
              <span className="text-foreground">How to verify:</span> On Render, official HTTP request logs list method,
              path, and status — not your JSON body. If you still see address text in log lines, check for debug{" "}
              <code className="text-foreground">print</code> in your API, <code className="text-foreground">LOG_LEVEL=debug</code>
              , or a log-streaming tool that captures bodies. Our API is written not to log <code className="text-foreground">/parse</code>{" "}
              payloads.
            </p>
          </Section>

          <Section title="6. Your rights">
            <p>
              Under UK GDPR you may have rights to access, rectify, erase, restrict, or object to processing, and to data
              portability, and to complain to the ICO (ico.org.uk). Contact us first at{" "}
              <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="text-primary hover:underline">
                {LEGAL_ENTITY.contactEmail}
              </a>{" "}
              and we will respond within a reasonable time (typically within one month).
            </p>
          </Section>

          <Section title="7. Cookies and similar technologies">
            <p>
              <span className="text-foreground">As built today:</span> our public site does not include Google Analytics,
              Meta Pixel, or similar marketing tags in <code className="text-foreground">index.html</code>. Clerk uses
              cookies and local storage so you can stay signed in; Clerk&apos;s own site and dashboard use additional
              technologies described in{" "}
              <a href="https://clerk.com/legal/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                Clerk&apos;s Privacy Policy
              </a>{" "}
              (your end users mainly interact with Clerk embedded on our domain — behaviour is still governed by Clerk&apos;s
              product and our configuration). When you use billing flows, Stripe may set its own cookies or similar
              technologies on Stripe-hosted pages.
            </p>
            <p>
              <span className="text-foreground">How to verify:</span> open your live site in Chrome → DevTools →
              Application → Cookies / Local storage, and walk through sign-in and (if applicable) checkout. Repeat after
              any change to third-party scripts.
            </p>
          </Section>

          <Section title="8. Business customers and DPAs">
            <p>
              If you are a company or organisation using Smart Address UK to process personal data on behalf of others
              (for example your own customers&apos; contacts or address data), you are responsible for your relationship with
              those individuals and for having a lawful basis to send data to us. Where UK/EU GDPR requires a written
              contract between controller and processor, email{" "}
              <a href={`mailto:${LEGAL_ENTITY.contactEmail}?subject=Data%20processing%20agreement`} className="text-primary hover:underline">
                {LEGAL_ENTITY.contactEmail}
              </a>{" "}
              with the subject &quot;Data processing agreement&quot; so we can discuss terms. Separately, you should
              accept Clerk&apos;s Data Processing Addendum in the Clerk dashboard if your policies require it for
              authentication data.
            </p>
          </Section>

          <Section title="9. Children">
            <p>The Service is not directed at children under 13, and we do not knowingly collect their personal data.</p>
          </Section>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
