import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - QuickBooks Online Integration",
  description: "Terms of service for the QuickBooks Online integration",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Internal Use Only
            </h2>
            <p>
              This QuickBooks Online integration is a private tool intended
              solely for internal use by the owner/operator of
              homeandmatter.com. It is not offered to the public or third
              parties.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              No Warranties
            </h2>
            <p>
              This integration is provided &quot;as is&quot; without warranty of
              any kind, express or implied, including but not limited to the
              warranties of merchantability, fitness for a particular purpose,
              and noninfringement.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Limitation of Liability
            </h2>
            <p>
              In no event shall the operator be liable for any direct, indirect,
              incidental, special, exemplary, or consequential damages arising
              out of or in connection with the use of this integration.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Operator Responsibilities
            </h2>
            <p>
              The operator is responsible for reviewing all invoices before
              sending them to customers and for ensuring compliance with all
              applicable accounting, tax, and legal requirements.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Governing Law
            </h2>
            <p>
              These terms shall be governed by and construed in accordance with
              the laws of the United States.
            </p>
          </section>

          <section className="border-t pt-6">
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Contact
            </h2>
            <p>
              For questions about these terms, contact:{" "}
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
