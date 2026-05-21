import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface NotificationSettings {
  dailyReminder: number;
  weeklyPreview: number;
}

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<NotificationSettings>({
    queryKey: ["/api/user/notification-settings"],
  });

  const mutation = useMutation({
    mutationFn: (patch: { dailyReminder: boolean; weeklyPreview: boolean }) =>
      apiRequest("PATCH", "/api/user/notification-settings", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user/notification-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const toggle = (field: "dailyReminder" | "weeklyPreview", value: boolean) => {
    if (!settings) return;
    mutation.mutate({
      dailyReminder: field === "dailyReminder" ? value : !!settings.dailyReminder,
      weeklyPreview: field === "weeklyPreview" ? value : !!settings.weeklyPreview,
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              <CardTitle>Slack Notifications</CardTitle>
            </div>
            <CardDescription>
              Controls automated Slack DMs. Only applies if your account is linked to a
              person record with a Slack User ID configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Daily task reminder</p>
                <p className="text-sm text-muted-foreground">
                  DM on days you are scheduled (08:00 UTC, Mon–Fri). Only sent for
                  assignments with "Send Slack reminder" enabled.
                </p>
              </div>
              <Switch
                checked={isLoading ? false : !!settings?.dailyReminder}
                onCheckedChange={(v) => toggle("dailyReminder", v)}
                disabled={isLoading || mutation.isPending}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Friday weekly preview</p>
                <p className="text-sm text-muted-foreground">
                  DM every Friday at 08:00 UTC with your full schedule for the
                  following week.
                </p>
              </div>
              <Switch
                checked={isLoading ? false : !!settings?.weeklyPreview}
                onCheckedChange={(v) => toggle("weeklyPreview", v)}
                disabled={isLoading || mutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
