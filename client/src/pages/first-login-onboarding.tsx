import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, UserRoundCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OnboardingStatus = {
  needsOnboarding: boolean;
  firstName: string;
  lastName: string;
};

export default function FirstLoginOnboarding() {
  const { availableWorkspaces, isLoading: workspacesLoading } = useWorkspace();
  const [, setLocation] = useLocation();
  const [workspaceId, setWorkspaceId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const { data: onboardingStatus, isLoading: statusLoading } = useQuery<OnboardingStatus>({
    queryKey: ["/api/auth/onboarding-status"],
    retry: false,
  });

  useEffect(() => {
    if (onboardingStatus) {
      setFirstName(onboardingStatus.firstName ?? "");
      setLastName(onboardingStatus.lastName ?? "");
    }
  }, [onboardingStatus]);

  useEffect(() => {
    if (!workspacesLoading && availableWorkspaces.length === 1) {
      setWorkspaceId(availableWorkspaces[0].id);
    }
  }, [workspacesLoading, availableWorkspaces]);

  const canSubmit = useMemo(() => {
    return workspaceId.trim().length > 0 && firstName.trim().length > 0 && lastName.trim().length > 0;
  }, [workspaceId, firstName, lastName]);

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/complete-onboarding", {
        workspaceId,
        firstName,
        lastName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      setLocation("/");
    },
  });

  if (statusLoading || workspacesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!onboardingStatus?.needsOnboarding) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <UserRoundCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl">Finish your setup</CardTitle>
          </div>
          <CardDescription>
            Select your workspace and confirm your name so we can link you to your schedule profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="workspace-select">Workspace</Label>
            <select
              id="workspace-select"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              data-testid="select-onboarding-workspace"
            >
              <option value="">Select a workspace</option>
              {availableWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                data-testid="input-onboarding-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                data-testid="input-onboarding-last-name"
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || completeOnboardingMutation.isPending}
            onClick={() => completeOnboardingMutation.mutate()}
            data-testid="button-complete-onboarding"
          >
            {completeOnboardingMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Finishing setup...
              </>
            ) : (
              "Continue to scheduler"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
