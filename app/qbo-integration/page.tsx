import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "QuickBooks Online Integration - Toasty Task",
  description: "Private QuickBooks Online integration for homeandmatter.com",
};

export default function QBOIntegrationPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">
          QuickBooks Online Integration
        </h1>

        <div className="space-y-6 text-muted-foreground">
          <p>
            This is a private, self-hosted automation tool used by the
            owner/operator of homeandmatter.com and their business.
          </p>

          <p>
            The integration reads invoicing data from spreadsheets and creates
            invoices in QuickBooks Online using Intuit&apos;s APIs (OAuth 2.0).
          </p>

          <p>
            This tool is not offered to the public and does not provide
            third-party access.
          </p>

          <div className="mt-12 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Related Pages
            </h2>
            <ul className="list-inside list-disc space-y-2">
              <li>
                <Link
                  href="/qbo-integration/privacy"
                  className="text-primary hover:underline"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/qbo-integration/terms"
                  className="text-primary hover:underline"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/qbo-integration/disconnect"
                  className="text-primary hover:underline"
                >
                  Disconnect Instructions
                </Link>
              </li>
            </ul>
          </div>

          <div className="mt-12 border-t pt-6">
            <h2 className="text-xl font-semibold text-foreground">Contact</h2>
            <p className="mt-2">
              For questions about this integration, contact:{" "}
              <a
                href="mailto:support@homeandmatter.com"
                className="text-primary hover:underline"
              >
                support@homeandmatter.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
