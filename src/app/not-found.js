import Link from "next/link";
import { VanImage } from "@/components/van-loader";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/50 px-4 text-center">
      <VanImage className="w-32 opacity-80" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that</h1>
        <p className="mt-1 max-w-sm text-muted-foreground">
          If you were tracking a package, check the number on your receipt and try again.
        </p>
      </div>
      <Button asChild size="lg" className="rounded-xl">
        <Link href="/track">Track a package</Link>
      </Button>
    </main>
  );
}
