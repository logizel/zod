declare const process: {
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
};

declare const fetch: (input: string, init?: any) => Promise<any>;
declare const AbortSignal: any;

declare const Buffer: { byteLength(s: string, encoding: string): number };

declare module 'turndown' {
  const TurndownService: any;
  export default TurndownService;
}
