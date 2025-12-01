import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type Assignment, type Task } from "@shared/schema";

export default function Reporting() {
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/assignments"] });
  const { data: allTasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  
  // Filter to only production tasks
  const tasks = allTasks.filter(t => (t as any).isProduction !== 0);

  // Group assignments by week
  const assignmentsByWeek = assignments.reduce((acc, assignment) => {
    if (!acc[assignment.weekStartDate]) {
      acc[assignment.weekStartDate] = [];
    }
    acc[assignment.weekStartDate].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

  // Get sorted unique weeks
  const weeks = Object.keys(assignmentsByWeek).sort();

  // Calculate totals: for each week/task combo, count unique batch IDs and their sizes
  // Each batch is counted only once, even if it spans multiple days
  const getWeekTotal = (weekDate: string, taskId: string): number => {
    const weekAssignments = assignmentsByWeek[weekDate] || [];
    const taskAssignments = weekAssignments.filter(a => a.taskId === taskId);
    
    // Group by batch number to count each batch only once
    const uniqueBatches = new Map<string, number>();
    
    taskAssignments.forEach(assignment => {
      const batchKey = assignment.batchNumber || `unnamed-${assignment.id}`;
      // Store only if not already seen (first instance of this batch for this task/week)
      if (!uniqueBatches.has(batchKey) && assignment.batchSize) {
        uniqueBatches.set(batchKey, assignment.batchSize);
      }
    });
    
    // Sum all unique batch sizes
    return Array.from(uniqueBatches.values()).reduce((sum, size) => sum + size, 0);
  };

  // Format date for display (e.g., "Dec 01, 2024")
  const formatWeekDate = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "2-digit", 
      year: "numeric" 
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="outline" size="icon" data-testid="button-back-to-admin">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-4xl font-bold">Weekly Capacity Report</h1>
        </div>

        {/* Table */}
        <Card className="p-6 overflow-auto max-h-96">
          {weeks.length === 0 ? (
            <p className="text-muted-foreground">No assignments yet</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-background">
                  <th className="text-left p-3 font-semibold min-w-32 sticky top-0 left-0 z-20 bg-background">Week Commencing</th>
                  {tasks.map((task) => (
                    <th 
                      key={task.id} 
                      className="text-left p-3 font-semibold min-w-28 sticky top-0 z-10 bg-background"
                      data-testid={`header-task-${task.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded flex-shrink-0"
                          style={{ backgroundColor: task.color }}
                        />
                        {task.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week} className="border-b hover:bg-muted/50">
                    <td className="p-3 font-medium sticky left-0 z-10 bg-background" data-testid={`cell-week-${week}`}>
                      {formatWeekDate(week)}
                    </td>
                    {tasks.map((task) => {
                      const total = getWeekTotal(week, task.id);
                      return (
                        <td 
                          key={`${week}-${task.id}`} 
                          className="p-3"
                          data-testid={`cell-${week}-${task.id}`}
                        >
                          {total > 0 ? total : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
