// Minimal Node globals shim (same precedent as packages/config, packages/logger).
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  cwd(): string;
};

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}
