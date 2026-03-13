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

const queryContainsDate = (queryKey: readonly unknown[], date: string) => {
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
