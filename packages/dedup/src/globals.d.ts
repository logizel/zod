// Minimal Node globals shim (same precedent as packages/config, packages/logger).
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  cwd(): string;
};

declare function setTimeout(handler: (...args: unknown[]) => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;
