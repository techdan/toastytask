import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - QuickBooks Online Integration",
  description: "Privacy policy for the QuickBooks Online integration",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-6 py-12">
        <nav className="mb-8">
          <Link
            href="/qbo-integration"
            className="text-sm text-muted-foreground hover:text-primary"
          >
            &larr; Back to QuickBooks Integration
          </Link>
        </nav>

        <h1 className="mb-8 text-3xl font-bold tracking-tight">
          Privacy Policy
        </h1>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Scope
            </h2>
            <p>
              This privacy policy applies to the private QuickBooks Online
              integration used by the owner/operator of homeandmatter.com. This
              integration is for internal use only and is not offered to third
              parties.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              What Data Is Accessed
            </h2>
            <p>The integration accesses the following data from QuickBooks Online:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Customer names</li>
              <li>Invoice line items and descriptions</li>
              <li>Invoice amounts</li>
              <li>Invoice metadata needed to create and manage invoices</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              How Data Is Used
            </h2>
            <p>
              Data is used solely to create, update, and reconcile invoices for
              the operator&apos;s business. No data is used for marketing,
              advertising, or any purpose unrelated to invoicing operations.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Data Storage
            </h2>
            <ul className="list-inside list-disc space-y-2">
              <li>
                The integration does not store customer or invoice content on
                external servers operated by this site beyond what is stored in
                QuickBooks Online itself.
              </li>
              <li>
                OAuth tokens may be stored locally by the operator running the
                integration script.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Data Sharing
            </h2>
            <p>
              No personal data is sold or shared with third parties, other than
              Intuit/QuickBooks as necessary for the integration to function.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Security
            </h2>
            <ul className="list-inside list-disc space-y-2">
              <li>
                The integration uses OAuth 2.0 for secure authentication with
                QuickBooks Online.
              </li>
              <li>
                Access is limited to the minimum permissions (least-privilege)
                required for invoice operations.
              </li>
              <li>
                Access can be revoked at any time through your QuickBooks Online
                account settings.
              </li>
            </ul>
          </section>

          <section className="border-t pt-6">
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Contact
            </h2>
            <p>
              For questions about this privacy policy, contact:{" "}
              <a
                href="mailto:support@homeandmatter.com"
                className="text-primary hover:underline"
              >
                support@homeandmatter.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
