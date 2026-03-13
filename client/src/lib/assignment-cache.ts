import { QueryClient } from "@tanstack/react-query";
import type { Assignment } from "@shared/schema";

const ASSIGNMENTS_PATH = "/api/assignments";

const toUrl = (key: string) => {
  try {
    return new URL(key, "http://localhost");
  } catch {
    return null;
  }
};

export const isAssignmentQuery = (query: { queryKey: readonly unknown[] }) => {
  const key = query.queryKey[0];
  return typeof key === "string" && key.startsWith(ASSIGNMENTS_PATH);
};

const isDateWithinRange = (date: string, startDate: string, endDate: string) => {
  return date >= startDate && date <= endDate;
};

export const queryContainsDate = (queryKey: readonly unknown[], date: string) => {
  const key = queryKey[0];
  if (typeof key !== "string" || !key.startsWith(ASSIGNMENTS_PATH)) return false;

  const url = toUrl(key);
  if (!url) return false;

  const weekStartDate = url.searchParams.get("weekStartDate");
  if (weekStartDate) return weekStartDate === date;

  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  if (startDate && endDate) {
    return isDateWithinRange(date, startDate, endDate);
  }

  // /api/assignments with no date constraints can contain all dates.
  return url.search === "";
};


interface ReorderCellPayload {
  weekStartDate: string;
  personId: string;
  day: string;
  assignmentIds: string[];
}

const reorderCellAssignments = (
  assignments: Assignment[],
  payload: ReorderCellPayload,
) => {
  const { personId, day, assignmentIds } = payload;
  const targetIds = new Set(assignmentIds);

  const untouched = assignments.filter((assignment) =>
    assignment.personId !== personId || assignment.day !== day || !targetIds.has(assignment.id),
  );

  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  const reordered: Assignment[] = [];
  assignmentIds.forEach((id, index) => {
    const assignment = byId.get(id);
    if (!assignment) return;
    reordered.push({ ...assignment, order: index });
  });

  if (reordered.length === 0) return assignments;

  return [...untouched, ...reordered];
};

const assignmentListUpdater = (
  old: Assignment[] | undefined,
  assignment: Assignment,
  shouldContain: boolean,
) => {
  if (!old) return old;

  const existingIndex = old.findIndex((cached) => cached.id === assignment.id);

  if (shouldContain) {
    if (existingIndex === -1) return [...old, assignment];
    const next = [...old];
    next[existingIndex] = assignment;
    return next;
  }

  if (existingIndex === -1) return old;
  return old.filter((cached) => cached.id !== assignment.id);
};

export const applyAssignmentUpsert = (
  client: QueryClient,
  assignment: Assignment,
  previousWeekStartDate?: string,
) => {
  const impactedDates = new Set([assignment.weekStartDate]);
  if (previousWeekStartDate) impactedDates.add(previousWeekStartDate);

  const cachedQueries = client.getQueryCache().findAll({ predicate: isAssignmentQuery });

  for (const query of cachedQueries) {
    const key = query.queryKey;
    const shouldContain = Array.from(impactedDates).some((date) => queryContainsDate(key, date));

    // Query isn't impacted at all.
    if (!shouldContain) continue;

    client.setQueryData<Assignment[]>(key, (old) => {
      const containsNewWeek = queryContainsDate(key, assignment.weekStartDate);
      return assignmentListUpdater(old, assignment, containsNewWeek);
    });
  }
};

type ReorderPayload = {
  weekStartDate: string;
  personId: string;
  day: Assignment["day"];
  orderedAssignmentIds: string[];
};

const reorderCellAssignments = (
  assignments: Assignment[],
  payload: ReorderPayload,
): Assignment[] => {
  const { weekStartDate, personId, day, orderedAssignmentIds } = payload;
  const orderedIds = new Set(orderedAssignmentIds);

  const cellAssignments = assignments.filter(
    (assignment) => assignment.weekStartDate === weekStartDate && assignment.personId === personId && assignment.day === day,
  );

  if (!cellAssignments.length) return assignments;

  const byId = new Map(cellAssignments.map((assignment) => [assignment.id, assignment]));
  const reorderedInCell = orderedAssignmentIds
    .map((id) => byId.get(id))
    .filter((assignment): assignment is Assignment => Boolean(assignment));

  for (const assignment of cellAssignments) {
    if (!orderedIds.has(assignment.id)) {
      reorderedInCell.push(assignment);
    }
  }

  if (!reorderedInCell.length) return assignments;

  const cellIdSet = new Set(cellAssignments.map((assignment) => assignment.id));
  const next: Assignment[] = [];
  let inserted = false;

  for (const assignment of assignments) {
    if (!cellIdSet.has(assignment.id)) {
      next.push(assignment);
      continue;
    }

    if (!inserted) {
      next.push(...reorderedInCell);
      inserted = true;
    }
  }

  if (!inserted) {
    next.push(...reorderedInCell);
  }

  return next;
};

export const applyAssignmentReorder = (client: QueryClient, payload: ReorderPayload) => {
  const { weekStartDate } = payload;
  const weekKey = `${ASSIGNMENTS_PATH}?weekStartDate=${weekStartDate}`;

  client.setQueryData<Assignment[]>([weekKey], (old) =>
    old ? reorderCellAssignments(old, payload) : old,
  );

  client.setQueriesData<Assignment[]>(
    {
      predicate: (query) => isAssignmentQuery(query) && queryContainsDate(query.queryKey, weekStartDate),
    },
    (old) => (old ? reorderCellAssignments(old, payload) : old),
  );
};

export const applyAssignmentDelete = (
  client: QueryClient,
  assignmentId: string,
  impactedDate?: string,
) => {
  if (!impactedDate) {
    client.invalidateQueries({ predicate: isAssignmentQuery });
    return;
  }

  const weekKey = `${ASSIGNMENTS_PATH}?weekStartDate=${impactedDate}`;
  client.setQueryData<Assignment[]>([weekKey], (old) =>
    old ? old.filter((assignment) => assignment.id !== assignmentId) : old,
  );

  client.setQueriesData<Assignment[]>(
    {
      predicate: (query) => isAssignmentQuery(query) && queryContainsDate(query.queryKey, impactedDate),
    },
    (old) => (old ? old.filter((assignment) => assignment.id !== assignmentId) : old),
  );
};

export const applyAssignmentReorderCell = (
  client: QueryClient,
  payload: ReorderCellPayload,
) => {
  const weekKey = `${ASSIGNMENTS_PATH}?weekStartDate=${payload.weekStartDate}`;

  client.setQueryData<Assignment[]>([weekKey], (old) =>
    old ? reorderCellAssignments(old, payload) : old,
  );

  client.setQueriesData<Assignment[]>(
    {
      predicate: (query) => isAssignmentQuery(query) && queryContainsDate(query.queryKey, payload.weekStartDate),
    },
    (old) => (old ? reorderCellAssignments(old, payload) : old),
  );
};
