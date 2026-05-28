export const generateSlug = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Drop non-word characters
    .replace(/[\s_-]+/g, "-") // Collapse whitespace/underscores to hyphen
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
};
