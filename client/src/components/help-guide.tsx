import { HelpCircle, Mouse, Keyboard, LayoutGrid, Filter, Bell, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold mb-2 text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Item({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex gap-2 mb-1.5 text-sm">
      <span className="font-medium text-foreground min-w-[140px] shrink-0">{label}</span>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, description }: { keys: React.ReactNode; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-2 text-sm">
      <span className="text-muted-foreground">{description}</span>
      <span className="shrink-0">{keys}</span>
    </div>
  );
}

export function HelpGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Help guide"
          data-testid="button-help-guide"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-help-guide">
        <DialogHeader>
          <DialogTitle>Help Guide</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basics" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0 grid w-full grid-cols-6">
            <TabsTrigger value="basics" className="text-xs">Basics</TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs">Assignments</TabsTrigger>
            <TabsTrigger value="views" className="text-xs">Views</TabsTrigger>
            <TabsTrigger value="filters" className="text-xs">Filters</TabsTrigger>
            <TabsTrigger value="shortcuts" className="text-xs">Shortcuts</TabsTrigger>
            <TabsTrigger value="admin" className="text-xs">Admin</TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Navigation">
              <Item label="Previous / Next" description="Arrow buttons move the schedule back or forward by one week (or month in Month view)." />
              <Item label="Today" description="Jumps back to the current week at any time." />
              <Item label="Date picker" description="Click the displayed date range to open a calendar and jump to any week." />
            </Section>

            <Section title="Notifications bell">
              <Item label="This week summary" description="Shows your scheduled tasks and leave for the current week, broken down by day." />
              <Item label="Upcoming leave" description="Lists your leave assignments over the next 5 weeks." />
              <Item label="Notifications" description="Assignment changes appear here. Click a notification to jump to that week. Hover a notification and click × to dismiss it." />
            </Section>

            <Section title="Notification settings">
              <Item label="Access" description="Open the cog menu and choose 'Notification Settings'. On the My Day page, tap the bell icon in the header." />
              <Item label="Daily task reminder" description="When enabled, you receive a Slack DM at 08:00 UTC on days you are scheduled. Only sent for assignments with 'Send Slack reminder' ticked." />
              <Item label="Friday weekly preview" description="When enabled, you receive a Slack DM every Friday at 08:00 UTC with your full schedule for the following week." />
              <Item label="Requires Slack" description="Notifications only send if your account is linked to a person record with a Slack User ID configured. Settings are saved regardless." />
            </Section>

            <Section title="Your schedule">
              <Item label="Show only my tasks" description="Toggle in the grid header to filter the view to your own assignments only. When active, a blue banner appears in the toolbar — press Escape to cancel. Requires your account to be linked to a person record in Admin." />
              <Item label="Person dot colour" description="Each person has an assigned colour shown next to their name and used for notification initials." />
              <Item label="Green dot" description="Shown next to a person's name when they have an assignment every day of the week." />
            </Section>

            <Section title="Workspace">
              <Item label="Switching workspaces" description="If you belong to multiple workspaces, use the workspace badge in the top-left to switch between them." />
              <Item label="New users" description="First-time users are shown all available workspaces and can self-join one." />
            </Section>
          </TabsContent>

          {/* ── Assignments ── */}
          <TabsContent value="assignments" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Adding tasks">
              <Item label="Click Add" description="Click the + button that appears in any empty cell to open the Add Assignment dialog." />
              <Item label="Right-click cell" description="Right-click any cell and choose 'Add Task' from the context menu." />
              <Item label="Repeat" description="Expand 'Repeat' in the dialog to schedule a task every N days, weeks, or months. A live preview shows exactly how many assignments will be created before you confirm." />
            </Section>

            <Section title="Editing & details">
              <Item label="Click a task" description="Opens the Task Details drawer where you can edit batch number, batch size, notes, custom name, custom colour, and Slack reminder toggle." />
              <Item label="⋯ menu button" description="Hover any task card to reveal a ⋯ (more) button in the top-right corner. Click it for a quick menu with Copy, Edit Details, Highlight, and Delete options — the same actions as the right-click menu." />
              <Item label="Custom name" description="Overrides the task name for this assignment only — useful for labelling specific samples." />
              <Item label="Custom colour" description="Overrides the task colour for this assignment only." />
              <Item label="Batch number & size" description="Optional identifiers used in reporting. Batch size requires a batch number. Click 'Auto' (shows a spinner while loading) to generate the next ID in sequence." />
              <Item label="Notes" description="Free text attached to an assignment. Shown as an info icon (ℹ) in the grid." />
              <Item label="Slack day reminder" description="When Slack integration is active, tick 'Send Slack reminder on the day of this task' to receive a direct message at 08:00 UTC (09:00 BST in summer) on the day of the assignment. The checkbox appears both when creating and when editing an assignment." />
              <Item label="Slack change updates" description="Tick 'Get Slack updates when this task is assigned or removed' to receive a DM whenever this specific assignment is created, deleted, or updated. Update messages include a bullet-point summary of exactly what changed (day, week, task, name, notes, batch) and a 'View your schedule →' link that opens the scheduler on the relevant week. Reassignments notify both the old and new person by name. The deep link requires APP_URL to be set in Replit Secrets by an admin." />
              <Item label="Slack App Home" description="Open the Lab Scheduler bot in Slack and click the 'Home' tab. The home shows: an app description with a link to the web app (if APP_URL is set); a 'Today' card at the top showing just your assignments for today (weekdays only); this week's full schedule with today marked 📍 and tomorrow marked 🔜; next week's schedule; and an About section with bot commands and an 'Open Scheduler →' button. Unlinked users see a step-by-step setup guide. The view refreshes every time you open it. Requires your Slack User ID to be linked in People settings." />
              <Item label="Slack bot commands" description="Message the Lab Scheduler bot directly in Slack. Commands: 'today' — your assignments for today; 'tomorrow' — your assignments for tomorrow (shows Monday if sent on a Friday); 'this week' — your full schedule for this week; 'next week' — your full schedule for next week; anything else — shows help then this week's schedule." />
              <Item label="Friday schedule preview" description="Every Friday at 08:00 UTC, the bot automatically sends each linked person their full schedule for the coming week." />
            </Section>

            <Section title="Moving & copying">
              <Item label="Drag to move" description="Drag any task box to a different person/day cell to move it." />
              <Item label="Reorder in cell" description="Drag a task up or down within the same cell to change its display order." />
              <Item label="Copy & paste" description="Select tasks with Ctrl+Click, press Ctrl+C, then right-click the target cell and choose Paste (or press Ctrl+V)." />
              <Item label="Duplicate" description="Open a task's detail drawer and click 'Duplicate' to copy it to multiple people and days in one action." />
            </Section>

            <Section title="Deleting">
              <Item label="Delete key" description="Press Delete or Backspace to remove selected assignments." />
              <Item label="Delete by drag" description="Drag one or more selected tasks onto the person name column — it turns red and shows 'Drop here to delete'. Release to confirm deletion." />
              <Item label="Delete series" description="Right-click (or use the ⋯ button) on any recurring assignment and choose 'Delete Series' to remove all occurrences at once." />
              <Item label="Undo" description="A toast notification appears for 5 seconds after deletion with an 'Undo' button." />
            </Section>

            <Section title="Highlighting">
              <Item label="Highlight task type" description="Use the ⋯ button or right-click a task and choose 'Highlight [name]' to fade all other tasks to 20% opacity." />
              <Item label="Highlight trained" description="Use the ⋯ button or right-click a task and choose 'Highlight trained' to show only people with prior experience on that task. An amber banner appears in the toolbar — press Escape to clear." />
              <Item label="Clear highlight" description="Use the ⋯ button, right-click and choose 'Clear Highlight', or press Escape." />
            </Section>
          </TabsContent>

          {/* ── Views ── */}
          <TabsContent value="views" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Week view (default)">
              <Item label="Layout" description="People as rows, Mon–Fri as columns. Today's column is highlighted in blue." />
              <Item label="Annual leave" description="Cells with leave tasks are highlighted red." />
              <Item label="Missing tasks" description="A red info icon in a day header means a 'required daily' task has not been scheduled for that day. Hover to see which tasks are missing." />
            </Section>

            <Section title="Month view">
              <Item label="Overview" description="Shows all weeks in the selected month. Same editing and drag interactions as week view." />
              <Item label="Navigation" description="Previous/Next moves by one month. The date picker jumps to any month." />
            </Section>

            <Section title="Pipeline view">
              <Item label="Layout" description="Only tasks flagged 'Show in pipeline view' (set in Admin) appear as rows, with people listed per day." />
              <Item label="Hide empty" description="Toggle the eye icon to hide pipeline rows with no assignments, keeping the view focused. When active, a blue banner appears in the toolbar — press Escape to cancel." />
            </Section>

            <Section title="Compact view">
              <Item label="Toggle" description="Click the Minimise/Maximise icon in the toolbar to switch between normal and compact row heights. Compact mode hides batch details to fit more rows on screen." />
            </Section>

            <Section title="Export / Import">
              <Item label="Export" description="Downloads a JSON file of all people, tasks, and assignments — useful as a backup or for migrating data." />
              <Item label="Import" description="Upload a previously exported JSON file. People, tasks, and assignments are created with remapped IDs." />
            </Section>
          </TabsContent>

          {/* ── Filters ── */}
          <TabsContent value="filters" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Filter menu">
              <Item label="Open" description="Click the filter (funnel) icon in the toolbar." />
              <Item label="Filter by people" description="Check or uncheck team members to show only their rows." />
              <Item label="Filter by tasks" description="Check or uncheck task types to show only those assignments." />
              <Item label="Active indicator" description="A badge on the filter icon counts all active filters — including people, tasks, 'Show only mine', and 'Highlight trained'. A 'Clear Filters' button appears in the toolbar when people or task filters are active." />
            </Section>

            <Section title="Saved filters">
              <Item label="Create" description="Set your desired people/task selection, then click 'Create Filter', give it a name, and save." />
              <Item label="Apply" description="Click any saved filter name to apply it instantly." />
              <Item label="Edit / Delete" description="Use the pencil or trash icon next to any saved filter." />
              <Item label="Folders" description="Drag filters into folders to organise them. Folders are collapsible and saved per workspace in your browser." />
            </Section>
          </TabsContent>

          {/* ── Shortcuts ── */}
          <TabsContent value="shortcuts" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Keyboard shortcuts">
              <ShortcutRow
                description="Copy selected assignments"
                keys={<span><Kbd>Ctrl</Kbd> + <Kbd>C</Kbd></span>}
              />
              <ShortcutRow
                description="Paste to last right-clicked cell"
                keys={<span><Kbd>Ctrl</Kbd> + <Kbd>V</Kbd></span>}
              />
              <ShortcutRow
                description="Delete selected assignments"
                keys={<span><Kbd>Delete</Kbd> or <Kbd>Backspace</Kbd></span>}
              />
              <ShortcutRow
                description="Clear active view filter (highlight trained, show only my assignments, hide empty pipeline rows)"
                keys={<Kbd>Escape</Kbd>}
              />
              <ShortcutRow
                description="Add/remove task from selection"
                keys={<span><Kbd>Ctrl</Kbd> + <Kbd>Click</Kbd></span>}
              />
            </Section>

            <Section title="Mouse interactions">
              <Item label="Left-click task" description="Open Task Details drawer." />
              <Item label="Right-click task" description="Context menu: Edit, Highlight, Highlight trained, Duplicate, Delete, Delete Series (recurring assignments only)." />
              <Item label="Right-click cell" description="Context menu: Add Task, Paste." />
              <Item label="Drag task" description="Move to a new person/day cell." />
              <Item label="Drag to name column" description="Drop on the person name (turns red) to delete." />
              <Item label="Ctrl+Click" description="Multi-select tasks for bulk copy/delete." />
            </Section>

            <p className="text-xs text-muted-foreground mt-2">Mac users: use <Kbd>⌘ Cmd</Kbd> in place of <Kbd>Ctrl</Kbd>.</p>
          </TabsContent>

          {/* ── Admin ── */}
          <TabsContent value="admin" className="flex-1 overflow-y-auto mt-4 pr-1">
            <Section title="Accessing admin">
              <Item label="Admin cog" description="Click the ⚙ cog icon in the toolbar. The dropdown shows admin sections (People, Tasks, Rota) and — for admins — a Reporting section (Capacity, Annual Leave, Absence), plus Export, Import, and Logout." />
              <Item label="Reporting (admin only)" description="Reporting links are visible in the cog menu only to Admin and Super Admin users. There are three reports: Capacity Reporting, AL Reporting, and Absence Reporting." />
              <Item label="Absence report" description="Shows a monthly heatmap of days where team members were recorded as absent, plus a per-person bar chart of total absence days for the selected year. Requires a task named 'Absent' or 'Absence' to exist in the system. Use the person filter dropdown (top-right) to show only one person's absences on the heatmap." />
              <Item label="Annual Leave report" description="Shows a monthly heatmap of AL events and a per-person AL summary bar chart. Use the person filter dropdown (top-right) to isolate one person's leave on the heatmap." />
              <Item label="Section navigation" description="Use the dropdown next to 'Admin' at the top of the Admin page to switch between sections. Each section (People, Tasks, Rota, Workspaces) is shown as the main focus." />
              <Item label="Direct links" description="Selecting People, Tasks, or Rota from the cog dropdown takes you straight to that section of the Admin page." />
            </Section>

            <Section title="People">
              <Item label="Add team member" description="Set a name and colour. Optionally link to a user account so they can use 'Show only my assignments' and see their schedule in Notifications." />
              <Item label="Reorder" description="Drag the handle next to a person's name to change their display order in the grid." />
              <Item label="Exclude" description="Tick 'Exclude' to hide someone from the grid without deleting their assignment history." />
              <Item label="User level" description="When a person is linked to a user account, a second dropdown appears next to the user link. Set their level: Member (default), Admin, or Super Admin. Super Admins can manage workspaces and are treated the same as env-var super admins." />
              <Item label="Slack User ID" description="When Slack integration is active, a 'Slack:' row appears under each person. Click it to enter the person's Slack Member ID (starts with U or W, e.g. U012AB3CD). Find it in Slack under their profile → More → Copy member ID. This is required for Slack reminders to reach them. Once set, a 'Test' button appears — click it to send a test DM immediately and confirm the ID is correct." />
            </Section>

            <Section title="Tasks">
              <Item label="Add task" description="Set a name, colour, and optional description. Flags: Production (counts in reporting), Required daily (warns if missing), Show in pipeline view." />
              <Item label="Required daily" description="When enabled, a red warning appears in the day header if this task has not been assigned to anyone that day." />
              <Item label="Pipeline view" description="Tasks must be flagged here before they appear in Pipeline view." />
            </Section>

            <Section title="Rota tasks">
              <Item label="Purpose" description="Automatically rotate a task assignment across team members each week (e.g., a weekly duty rota)." />
              <Item label="Frequency" description="Daily (Mon–Fri every week) or Weekly (one specific day per week)." />
              <Item label="Interval" description="Set to 2 to assign every other week, 3 for every third week, etc." />
              <Item label="People search" description="When building the rota order, use the search box in the 'Available people' panel to filter by name — useful for large teams." />
              <Item label="Auto-apply" description="Rota assignments are created automatically when you open a week. A toast confirms how many were added. Deleting a rota assignment skips that slot permanently." />
              <Item label="Archive" description="Archive a rota task to stop future assignments without deleting history." />
              <Item label="Error messages" description="If creating or updating a rota task fails, the toast notification shows the specific reason rather than a generic error." />
            </Section>

            <Section title="Workspaces">
              <Item label="Members" description="Add users to a workspace, assign them Member or Admin roles, or remove them." />
              <Item label="Multiple workspaces" description="Super-admins can create and manage multiple workspaces. Each workspace has its own people, tasks, and assignments." />
            </Section>

            <Section title="Announcements">
              <Item label="Sitewide bar" description="Set a notification bar that appears at the top of the app for all users. Navigate to Admin → Announcements to manage them." />
              <Item label="Types" description="Choose from Info (blue), Warning (amber), Success (green), Alarm (red), Announcement (purple), Maintenance (orange), or Update (teal) to match the urgency of the message." />
              <Item label="Activate / Deactivate" description="Only one announcement is shown at a time. Use Activate to make one live and Deactivate to hide it without deleting it." />
              <Item label="Dismissable" description="Users can dismiss the bar by clicking ×. It reappears after 24 hours, or immediately if a new announcement is activated." />
            </Section>

            <Section title="Capacity Report">
              <Item label="View granularity" description="Switch between Weekly, Monthly, and Yearly views using the tabs at the top. Monthly and Yearly views aggregate weekly totals." />
              <Item label="Chart type" description="Toggle between Bar and Line chart using the Bar / Line tabs in the top-right corner of the chart card." />
              <Item label="Show empty periods" description="Tick 'Show empty periods' to include weeks, months, or years with no data in the chart and table. Unticked by default." />
              <Item label="Fullscreen chart" description="Click the expand icon (⤢) in the top-right corner of the chart card to open it in a fullscreen dialog." />
              <Item label="Date filter" description="Use the Filter Dates button to restrict the report to a specific date range." />
              <Item label="Task filter" description="Use the Tasks button to show or hide individual production tasks from the chart and table." />
              <Item label="Export CSV" description="Click 'Export CSV' in the Data Table card header to download the currently visible data (respecting view mode, date range, and task filter) as a CSV file." />
              <Item label="Data table" description="Shown below the chart; expands vertically to fit all rows — no internal scroll." />
            </Section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
