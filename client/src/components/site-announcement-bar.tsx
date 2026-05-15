import { useQuery } from "@tanstack/react-query";
import { Info, AlertTriangle, CheckCircle } from "lucide-react";
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

export function SiteAnnouncementBar() {
  const { data: announcement } = useQuery<SiteAnnouncement | null>({
    queryKey: ["/api/site-announcement/active"],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (!announcement) return null;

  const styles = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.info;

  return (
    <div className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium ${styles.bar}`}>
      {styles.icon}
      <span>{announcement.message}</span>
    </div>
  );
}
