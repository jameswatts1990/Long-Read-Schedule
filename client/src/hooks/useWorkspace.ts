import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { assignmentKeys } from "@/lib/queryKeys";
import type { Workspace } from "@shared/schema";

export function useWorkspace() {
  const { data: activeWorkspace, isLoading: isLoadingActive } = useQuery<Workspace | null>({
    queryKey: ["/api/my-workspace"],
    staleTime: Infinity,
    retry: false,
  });

  const { data: availableWorkspaces = [], isLoading: isLoadingList } = useQuery<Workspace[]>({
    queryKey: ["/api/my-workspaces"],
    staleTime: Infinity,
    retry: false,
  });

  const setWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", "/api/my-workspace", { workspaceId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      queryClient.invalidateQueries({ queryKey: ["/api/premade-filters"] });
    },
  });

  return {
    activeWorkspace: activeWorkspace ?? null,
    availableWorkspaces,
    isLoading: isLoadingActive || isLoadingList,
    setWorkspace: (id: string) => setWorkspaceMutation.mutateAsync(id),
    isSettingWorkspace: setWorkspaceMutation.isPending,
  };
}
