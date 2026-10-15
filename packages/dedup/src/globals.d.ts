// Minimal Node globals shim (same precedent as packages/config, packages/logger).
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  cwd(): string;
};

declare function setTimeout(handler: (...args: unknown[]) => void, timeout: number): unknown;
declare function clearTimeout(id: unknown): void;

declare class URL {
  constructor(url: string);
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  searchParams: URLSearchParams;
  hash: string;
  toString(): string;
}

declare class URLSearchParams {
  constructor(init?: string);
  delete(name: string): void;
  sort(): void;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

declare module 'node:crypto' {
  export interface Hash {
    update(data: string): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}
