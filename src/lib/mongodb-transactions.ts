export function isMongoTransactionsUnsupported(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === 20 &&
    error.message.includes("Transaction numbers are only allowed on a replica set member or mongos")
  );
}
