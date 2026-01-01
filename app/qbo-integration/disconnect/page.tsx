import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Disconnect - QuickBooks Online Integration",
  description: "Instructions to disconnect the QuickBooks Online integration",
};

export default function DisconnectPage() {
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
          Disconnect QuickBooks Online Integration
        </h1>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <p className="mb-6">
              To disconnect this integration from your QuickBooks Online
              account, follow these steps:
            </p>

            <ol className="list-inside list-decimal space-y-4">
              <li className="pl-2">Sign in to QuickBooks Online.</li>
              <li className="pl-2">
                Go to <strong className="text-foreground">Settings</strong> (the
                gear icon) and select{" "}
                <strong className="text-foreground">Apps</strong> or{" "}
                <strong className="text-foreground">Connected Apps</strong>.
              </li>
              <li className="pl-2">
                Find the integration for{" "}
                <strong className="text-foreground">homeandmatter.com</strong>{" "}
                in the list.
              </li>
              <li className="pl-2">
                Select it and click{" "}
                <strong className="text-foreground">Disconnect</strong>.
              </li>
            </ol>
          </section>

          <section className="rounded-lg border bg-muted/50 p-4">
            <p>
              <strong className="text-foreground">Note:</strong> Disconnecting
              revokes the integration&apos;s access tokens and prevents any
              further API access to your QuickBooks Online account.
            </p>
          </section>

          <section className="border-t pt-6">
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Contact
            </h2>
            <p>
              For assistance with disconnecting, contact:{" "}
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
