import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, AlertTriangle, CheckCircle, Bell, Megaphone, Wrench, Sparkles, X } from "lucide-react";
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
  error: {
    bar: "bg-red-600 text-white",
    icon: <Bell className="h-4 w-4 shrink-0" />,
  },
  announcement: {
    bar: "bg-purple-600 text-white",
    icon: <Megaphone className="h-4 w-4 shrink-0" />,
  },
  maintenance: {
    bar: "bg-orange-500 text-white",
    icon: <Wrench className="h-4 w-4 shrink-0" />,
  },
  update: {
    bar: "bg-teal-600 text-white",
    icon: <Sparkles className="h-4 w-4 shrink-0" />,
  },
};

const DISMISS_KEY = "dismissed_announcement";
const ONE_DAY_MS = 86_400_000;

function isDismissed(id: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const { announcementId, dismissedAt } = JSON.parse(raw);
    return announcementId === id && Date.now() - dismissedAt < ONE_DAY_MS;
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify({ announcementId: id, dismissedAt: Date.now() }));
}

export function SiteAnnouncementBar() {
  const { data: announcement } = useQuery<SiteAnnouncement | null>({
    queryKey: ["/api/site-announcement/active"],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const [dismissed, setDismissed] = useState(() =>
    announcement ? isDismissed(announcement.id) : false
  );

  if (!announcement || dismissed) return null;

  // Check localStorage on each render in case the stored state wasn't available during useState init
  if (isDismissed(announcement.id)) return null;

  const styles = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.info;

  function handleDismiss() {
    dismiss(announcement!.id);
    setDismissed(true);
  }

  return (
    <div className={`sticky top-0 z-50 w-full px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium ${styles.bar}`}>
      {styles.icon}
      <span className="flex-1 text-center">{announcement.message}</span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss announcement"
        className="ml-auto opacity-80 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
