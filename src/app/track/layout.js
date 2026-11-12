export const metadata = {
  title: "Track your package | H2H Express",
  description: "See where your H2H Express package is, from drop-off to pickup.",
};

export default function TrackLayout({ children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="px-4 pb-5 text-center text-xs text-muted-foreground">
        Hand to Hand Express · Canada, Ethiopia and Uganda
      </footer>
    </div>
  );
}
