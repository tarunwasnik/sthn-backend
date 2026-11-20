/** Cross-platform development entrypoint. Production continues to use server.ts directly. */
process.env.NODE_ENV = "development";

void import("./server").then(({ startServer }) => startServer());
