# Design Guidelines: Lab Team Scheduling Application

## Design Approach

**Selected System:** Linear-inspired productivity design with Material Design data density principles

**Rationale:** This is a utility-focused, information-dense scheduling tool requiring high performance, clarity, and efficient data visualization. Linear's minimalist aesthetic combined with Material's structured grid systems provides optimal usability for complex scheduling workflows.

**Core Principles:**
- Clarity over decoration: Clean, scannable information hierarchy
- Data density without clutter: Maximize useful information per viewport
- Functional color coding: Dual-layer visual system (task + person)
- Desktop-optimized interactions: Large touch targets, keyboard shortcuts

---

## Typography

**Font Family:** 
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for batch numbers/IDs)

**Type Scale:**
- **Headings:** text-2xl font-semibold (Page titles), text-lg font-semibold (Section headers)
- **Body:** text-base font-normal (Default text), text-sm font-medium (Task names, labels)
- **Small:** text-xs font-normal (Metadata, time labels, batch numbers)
- **Emphasis:** font-semibold for task assignments, font-medium for person names

---

## Layout System

**Spacing Primitives:** Tailwind units of **2, 3, 4, 6, 8** (e.g., p-2, gap-4, mt-6, h-8)

**Grid Structure:**
- Main container: max-w-screen-2xl mx-auto with px-6 py-4
- Calendar grid: 7 columns (day labels + Mon-Fri + weekend buffer)
- AM/PM split: 2 rows per day with gap-2
- Sidebar: Fixed 280px width for controls/filters

**Responsive Breakpoints:** Desktop-first (min-width: 1280px optimal)

---

## Component Library

### Core Navigation
**Top Bar:** Fixed header (h-16) with app logo, week navigation arrows, current week display, quick actions (Add Person, Add Task, Export)

**Left Sidebar:** 
- Collapsible panel with People List (color indicator dots, 8px circles, names)
- Task Library (color swatches, 16px squares, task names with icons from Heroicons)
- Filter toggles grouped with dividers (divide-y with py-3 spacing)

### Scheduling Grid
**Time Slot Cells:** 
- Size: min-h-32 with p-3
- Hover state: Subtle border emphasis (border-2)
- Empty state: Dashed border placeholder with "Drag task here" hint (text-xs opacity-40)
- Occupied: Task card fills cell with rounded-lg corners

**Task Cards:**
- Compact card design: p-3, rounded-lg, border-l-4 (person color accent)
- Background: Task color at 20% opacity
- Structure: Task name (text-sm font-medium), person name (text-xs), batch # (text-xs mono), truncated notes with expand icon
- Drag handle: Heroicons bars-3 icon (size-4) positioned top-left
- Quick actions: Small icon buttons (size-6) for edit/duplicate/delete on hover

**Day Headers:**
- Size: h-12 with centered text
- Display: Day name + date (e.g., "Monday, Jan 15")
- AM/PM labels: text-xs uppercase tracking-wide in subheaders (h-8)

### Modals & Forms
**Add/Edit Task Modal:**
- Centered overlay: max-w-lg with p-6
- Form layout: Single column with gap-4
- Inputs: h-10 with px-3, rounded-md borders
- Color pickers: Grid of color swatches (grid-cols-6, gap-2)
- Buttons: h-10 with px-6

**Person Management Panel:**
- Slide-in right panel: w-96
- List items: h-12 with px-4, flex layout
- Add person form: Inline input + color picker

### Data Display
**Quick Stats Bar:** 
- Positioned between top bar and grid (h-14)
- Flex layout showing: Total tasks this week, Person workload distribution (compact bars), Unassigned tasks count
- Spacing: gap-8 between stat groups

**Filter Chips:**
- Size: h-8 with px-3, rounded-full
- Active state: Solid fill with person/task color
- Inactive: Border outline only

### Overlays
**Task Details Drawer:**
- Right-side panel: w-96, slide-in animation
- Sections: Task info (gap-4), Batch details, Notes textarea (h-32), Dates picker, Assignment history
- Action bar: Sticky bottom with Save/Cancel (h-14)

---

## Interaction Patterns

**Drag & Drop:**
- Dragging task: Elevated shadow (shadow-xl), slight rotation (rotate-2), 90% opacity
- Drop zones: Highlight with dashed border animation (border-dashed border-2)
- Invalid drop: Subtle shake animation (one-time)

**Quick Actions:**
- Hold Shift + Click task: Duplicate to next time slot
- Double-click empty slot: Quick add task modal
- Right-click task: Context menu for common actions

**Color Indicators:**
- Dual-layer system: Task background color (fill), Person accent color (left border-l-4)
- Legend positioned in bottom-right corner: Collapsible panel showing all color mappings

---

## Animations

**Minimal, purposeful only:**
- Modal entrance: Fade + scale (duration-200)
- Drawer slide: translate-x (duration-300)
- Task card drag: transform (duration-150)
- Filter activation: Background transition (duration-200)

**No scroll-based or decorative animations**

---

## Accessibility

- All interactive elements: min-h-10 for click targets
- Color coding supplemented with text labels and icons
- Keyboard navigation: Tab order through grid, Arrow keys for cell navigation
- Focus indicators: ring-2 with high contrast
- Screen reader: Aria-labels for all grid cells and task cards

---

## Images

**No hero images.** This is a productivity tool focused on the scheduling grid as the primary interface. Visual hierarchy comes from typography, spacing, and functional color coding rather than imagery.