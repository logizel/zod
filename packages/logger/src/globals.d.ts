// Minimal Node globals shim (01-01 tracer).
// The approved install set carries no type packages, so the two globals this
// slice touches are declared here instead of pulling `@types/node`.
declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
};
