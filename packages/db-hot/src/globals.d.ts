// Minimal Node globals shim (same precedent as packages/config, packages/logger).
// The approved install set carries no type packages, so the globals this slice
// touches are declared here instead of pulling `@types/node`.
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  cwd(): string;
};

declare function setTimeout(handler: (...args: unknown[]) => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;

declare function btoa(data: string): string;
declare function atob(data: string): string;

declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(
    path: string,
    data: string,
    options?: { mode?: number },
  ): void;
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): { mode: number };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}
