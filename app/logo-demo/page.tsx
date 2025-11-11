import { LogoComparison } from "@/components/logo-comparison";

export default function LogoDemoPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">Logo Comparison</h1>
          <p className="text-muted-foreground">
            Compare the current filled logo with the new CSS-stroked logo variant
          </p>
        </div>

        <LogoComparison />
      </div>
    </div>
  );
}
