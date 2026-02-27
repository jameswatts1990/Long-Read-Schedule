import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Layers, ArrowRight, Loader2 } from "lucide-react";

export default function WorkspacePicker() {
  const { availableWorkspaces, isLoading, setWorkspace, isSettingWorkspace } = useWorkspace();
  const [, setLocation] = useLocation();

  // Auto-select if only one workspace
  useEffect(() => {
    if (!isLoading && availableWorkspaces.length === 1) {
      setWorkspace(availableWorkspaces[0].id).then(() => setLocation("/"));
    }
  }, [isLoading, availableWorkspaces]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSelect = async (workspaceId: string) => {
    await setWorkspace(workspaceId);
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <Layers className="h-7 w-7 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Select Workspace</h1>
            <p className="text-sm text-muted-foreground">Choose a workspace to continue</p>
          </div>
        </div>

        {availableWorkspaces.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm text-center py-4">
                You have not been added to any workspace yet. Contact your administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {availableWorkspaces.map((ws) => (
              <Card
                key={ws.id}
                className="hover-elevate cursor-pointer"
                onClick={() => !isSettingWorkspace && handleSelect(ws.id)}
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
                    variant="ghost"
                    size="icon"
                    disabled={isSettingWorkspace}
                    onClick={(e) => { e.stopPropagation(); handleSelect(ws.id); }}
                    data-testid={`button-enter-workspace-${ws.id}`}
                  >
                    {isSettingWorkspace ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
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
