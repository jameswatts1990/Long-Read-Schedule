# Lab Team Scheduling Application

## Overview

This is a **Lab Team Scheduling Application** designed for laboratory environments to manage task assignments across team members. The application provides a visual, calendar-based interface for scheduling lab tasks across weekdays (Monday-Friday) with AM/PM time slots. It features a dual-layer color coding system that combines task colors with person colors for quick visual identification, batch number tracking, and comprehensive notes management.

The application follows a Linear-inspired productivity design philosophy with Material Design data density principles, emphasizing clarity over decoration and maximizing useful information per viewport. It's optimized for desktop use with large touch targets and keyboard shortcuts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management with aggressive caching (`staleTime: Infinity`)

**UI Component System:**
- shadcn/ui component library (New York variant) built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Custom color system supporting both task colors (pastel backgrounds) and person colors (vibrant identifiers)
- Typography: Inter for UI text, JetBrains Mono for monospaced data (batch numbers)

**State Management Pattern:**
- Server state managed via TanStack Query with manual cache invalidation
- Local UI state managed with React hooks (useState, useEffect)
- Form state handled by react-hook-form with Zod schema validation
- No global client state management library (Redux, Zustand, etc.)

**Key UI Features:**
- Drag-and-drop task assignment movement between calendar cells
- Modal dialogs for creating/editing people, tasks, and assignments
- Side drawer for detailed assignment editing
- Conflict detection when assigning multiple tasks to same person/slot
- Filter system for people and tasks visibility
- Week navigation with Monday-based week starts

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript running on Node.js
- Custom Vite middleware integration for development hot-reloading
- RESTful API design pattern

**API Structure:**
```
GET    /api/people          - Fetch all people
POST   /api/people          - Create new person
DELETE /api/people/:id      - Delete person

GET    /api/tasks           - Fetch all tasks
POST   /api/tasks           - Create new task
DELETE /api/tasks/:id       - Delete task

GET    /api/assignments     - Fetch all assignments
POST   /api/assignments     - Create new assignment (with conflict detection)
PATCH  /api/assignments/:id - Update assignment
DELETE /api/assignments/:id - Delete assignment
GET    /api/assignments/conflicts/:personId/:day/:weekStartDate - Check conflicts
```

**Data Validation:**
- Zod schemas defined in shared directory for both client and server
- Request validation using zodResolver with react-hook-form on client
- Server-side validation using Zod parse on all incoming requests
- Type-safe data transfer with shared TypeScript types

**Error Handling:**
- Centralized error responses with appropriate HTTP status codes
- Toast notifications for user-facing error messages
- Request/response logging middleware for debugging

### Data Storage

**ORM & Database:**
- Drizzle ORM for type-safe database queries
- Neon serverless PostgreSQL as the database provider
- Schema-first approach with TypeScript type inference

**Data Models:**

**People Table:**
- `id` (UUID, primary key, auto-generated)
- `name` (text, required)
- `color` (text, required) - Hex color for person identification

**Tasks Table:**
- `id` (UUID, primary key, auto-generated)
- `name` (text, required)
- `color` (text, required) - Pastel background color
- `description` (text, optional)

**Assignments Table:**
- `id` (UUID, primary key, auto-generated)
- `taskId` (varchar, foreign key reference)
- `personId` (varchar, foreign key reference)
- `day` (text, enum: Monday-Friday)
- `weekStartDate` (text, ISO date format YYYY-MM-DD)
- `batchNumber` (text, optional)
- `notes` (text, optional)
- `date` (text, optional, ISO date format)

**Database Initialization:**
- Sample data seeded on first run if database is empty
- Migration system using Drizzle Kit with migrations stored in `/migrations`
- Database push command: `npm run db:push`

### External Dependencies

**Core Runtime Dependencies:**
- `@neondatabase/serverless` - Serverless PostgreSQL database driver
- `drizzle-orm` - TypeScript ORM with type inference
- `express` - Web server framework
- `vite` - Build tool and dev server

**React Ecosystem:**
- `react` & `react-dom` - UI framework
- `@tanstack/react-query` - Server state management
- `wouter` - Lightweight routing
- `react-hook-form` - Form state management
- `date-fns` - Date manipulation utilities

**UI Component Libraries:**
- `@radix-ui/*` - Headless UI primitives (20+ components)
- `tailwindcss` - Utility-first CSS framework
- `class-variance-authority` - Type-safe component variants
- `cmdk` - Command menu component
- `embla-carousel-react` - Carousel component
- `lucide-react` - Icon library

**Validation & Type Safety:**
- `zod` - Schema validation
- `drizzle-zod` - Drizzle schema to Zod conversion
- `@hookform/resolvers` - React Hook Form Zod integration

**Development Tools:**
- `typescript` - Type checking
- `tsx` - TypeScript execution for development
- `esbuild` - Production bundling for server code
- `drizzle-kit` - Database migration tooling

**Replit Integration:**
- `@replit/vite-plugin-runtime-error-modal` - Development error overlay
- `@replit/vite-plugin-cartographer` - Code navigation
- `@replit/vite-plugin-dev-banner` - Development banner

**Build & Deployment:**
- Development: `npm run dev` - Runs Express server with Vite middleware
- Build: `npm run build` - Bundles client (Vite) and server (esbuild)
- Production: `npm start` - Runs bundled Express server serving static assets
- Type checking: `npm run check` - TypeScript validation without emitting files