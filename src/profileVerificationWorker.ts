import "dotenv/config";

import { startDedicatedProfileVerificationWorker } from "./services/profile/profileVerificationDedicatedWorker.service";

if (require.main === module) {
  void startDedicatedProfileVerificationWorker().catch((error: unknown) => {
    console.error("Dedicated profile-verification worker failed to start", error);
    process.exitCode = 1;
  });
}
