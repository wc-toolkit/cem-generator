export interface LargeRecursiveType {
  child?: LargeRecursiveType;
  value: string;
}

export const largeValue: LargeRecursiveType = { value: "ok" };
