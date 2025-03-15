export type InsertOptions = {
  allowNullDbValues?: boolean;
  onConflict?: "ignore" | "update";
  retryCount?: number;
  retryDelay?: number;
};

export const DEFAULT_INSERT_OPTIONS: InsertOptions = {
  allowNullDbValues: false,
  onConflict: "update",
  retryCount: 2,
  retryDelay: 2000,
};
