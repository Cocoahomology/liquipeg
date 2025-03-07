export type InsertOptions = {
  allowNullDbValues?: boolean;
  onConflict?: "ignore" | "error";
  retryCount?: number;
  retryDelay?: number;
};

export const DEFAULT_INSERT_OPTIONS: InsertOptions = {
  allowNullDbValues: false,
  onConflict: "error",
  retryCount: 2,
  retryDelay: 2000,
};
