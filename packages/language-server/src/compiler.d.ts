declare module '@zenithbuild/compiler' {
  export function compile(
    input: string | { source: string; filePath: string },
    filePathOrOptions?: string | object
  ): unknown;
}
