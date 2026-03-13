export const assignmentKeys = {
  all: ["assignments"] as const,
  week: (weekStartDate: string) => [...assignmentKeys.all, "week", weekStartDate] as const,
  range: (startDate: string, endDate: string) =>
    [...assignmentKeys.all, "range", startDate, endDate] as const,
};
