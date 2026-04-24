import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Layers, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Workspace } from "@shared/schema";

export default function WorkspacePicker() {
  const [, setLocation] = useLocation();

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces/available"],
    staleTime: Infinity,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-status"] });
      setLocation("/");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <Layers className="h-7 w-7 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Join a Workspace</h1>
            <p className="text-sm text-muted-foreground">Select a workspace to get started</p>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm text-center py-4">
                No workspaces are available yet. Contact your administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {workspaces.map((ws) => (
              <Card
                key={ws.id}
                className="hover-elevate cursor-pointer"
                onClick={() => !joinMutation.isPending && joinMutation.mutate(ws.id)}
                data-testid={`card-workspace-${ws.id}`}
              >
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                  <div>
                    <CardTitle className="text-base">{ws.name}</CardTitle>
                    {ws.description && (
                      <CardDescription className="mt-0.5 text-sm">{ws.description}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={joinMutation.isPending}
                    onClick={(e) => { e.stopPropagation(); joinMutation.mutate(ws.id); }}
                    data-testid={`button-join-workspace-${ws.id}`}
                  >
                    {joinMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Join"
                    )}
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
