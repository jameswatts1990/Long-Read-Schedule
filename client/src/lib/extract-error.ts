// Extracts the human-readable server message from an apiRequest error.
// apiRequest throws Error("<status>: <message>") — strip the status prefix.
export const extractErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : "Unexpected error";
  const colonIdx = raw.indexOf(": ");
  return colonIdx !== -1 ? raw.slice(colonIdx + 2) : raw;
};
