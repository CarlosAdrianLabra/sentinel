export function ProcessingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-sm">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      <p className="animate-pulse font-hud text-sm tracking-widest text-primary">
        PROCESANDO…
      </p>
    </div>
  );
}
