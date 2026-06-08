import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SessionExpiredBannerProps {
  sessionExpired: boolean;
}

export function SessionExpiredBanner({ sessionExpired }: SessionExpiredBannerProps) {
  if (!sessionExpired) return null;

  const handleSignIn = () => {
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    window.location.assign(`/api/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-lg max-w-xs">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">Session timed out</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Your data is shown as last saved.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 text-xs"
          onClick={handleSignIn}
        >
          Sign back in
        </Button>
      </div>
    </div>
  );
}
