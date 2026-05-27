export function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Unknown error';
}
