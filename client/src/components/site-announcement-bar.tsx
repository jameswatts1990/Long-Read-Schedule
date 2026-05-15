import { useQuery } from "@tanstack/react-query";
import { X, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { useState } from "react";
import type { SiteAnnouncement } from "@shared/schema";

const TYPE_STYLES: Record<string, { bar: string; icon: React.ReactNode }> = {
  info: {
    bar: "bg-blue-600 text-white",
    icon: <Info className="h-4 w-4 shrink-0" />,
  },
  warning: {
    bar: "bg-amber-500 text-white",
    icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
  },
  success: {
    bar: "bg-green-600 text-white",
    icon: <CheckCircle className="h-4 w-4 shrink-0" />,
  },
};

const DISMISSED_KEY = "dismissed_announcements";

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addDismissed(id: string) {
  const current = getDismissed();
  if (!current.includes(id)) {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current, id]));
  }
}

export function SiteAnnouncementBar() {
  const [dismissed, setDismissed] = useState<string[]>(getDismissed);

  const { data: announcement } = useQuery<SiteAnnouncement | null>({
    queryKey: ["/api/site-announcement/active"],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (!announcement || dismissed.includes(announcement.id)) return null;

  const styles = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.info;

  const dismiss = () => {
    addDismissed(announcement.id);
    setDismissed(getDismissed());
  };

  return (
    <div className={`w-full px-4 py-2 flex items-center gap-3 text-sm ${styles.bar}`}>
      {styles.icon}
      <span className="flex-1">{announcement.message}</span>
      <button
        onClick={dismiss}
        className="ml-2 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
