import { Loader2 } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function LoadingOverlay() {
  const isMutating = useIsMutating();

  if (isMutating === 0) return null;

  return (
    <div 
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-sm transition-opacity duration-300",
        isMutating > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      data-testid="loading-overlay"
    >
      <div className="flex flex-col items-center gap-2 p-6 rounded-lg bg-card border shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Saving changes...</p>
      </div>
    </div>
  );
}
