import { MongoClient } from "mongodb";

import { runCreatorVerificationTypedTargetMigration } from "../services/creator/creatorVerificationMigrationRunner.service";

const argumentsSet = new Set(process.argv.slice(2));
const required = ["--apply", "--confirm-maintenance", "--confirm-verification-writes-paused", "--confirm-active-operations-drained", "--confirm-creator-disabled"] as const;
const backupConfirmation = "--confirm-backup-recovery";
const developmentRiskAcknowledgement = "--acknowledge-development-user-creator-data-risk";

const main = async () => {
  if (argumentsSet.has("--retire-legacy-indexes")) throw new Error("Legacy index retirement is intentionally not supported by this runner.");
  if (required.some((argument) => !argumentsSet.has(argument))) throw new Error("Refusing migration without every explicit apply and operational confirmation flag.");
  const backupConfirmed = argumentsSet.has(backupConfirmation);
  const developmentRiskAccepted = argumentsSet.has(developmentRiskAcknowledgement);
  if (backupConfirmed === developmentRiskAccepted) throw new Error("Choose exactly one of verified backup/recovery confirmation or the development-only disposable User/Creator data-risk acknowledgement.");
  const maintenanceEvidenceReference = process.env.STHN_CREATOR_MIGRATION_MAINTENANCE_EVIDENCE_REFERENCE;
  const backupRecoveryEvidenceReference = process.env.STHN_CREATOR_MIGRATION_BACKUP_RECOVERY_EVIDENCE_REFERENCE;
  const developmentNoBackupAcknowledgementReference = process.env.STHN_CREATOR_MIGRATION_DEVELOPMENT_RISK_ACKNOWLEDGEMENT_REFERENCE;
  const uri = process.env.MONGODB_URI;
  if (!uri || !maintenanceEvidenceReference || (backupConfirmed && !backupRecoveryEvidenceReference) || (developmentRiskAccepted && !developmentNoBackupAcknowledgementReference)) throw new Error("MONGODB_URI, maintenance evidence, and the selected non-sensitive backup or development-risk evidence reference are required.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    const result = await runCreatorVerificationTypedTargetMigration({
      database: client.db(),
      attestation: {
        apply: true, maintenanceWindowConfirmed: true, backupRecoveryConfirmed: backupConfirmed,
        ...(developmentRiskAccepted ? { developmentNoBackupUserCreatorRiskAcknowledged: true } : {}),
        verificationWritesPaused: true, activeVerificationOperationsDrained: true, creatorVerificationRemainsDisabled: true,
        maintenanceEvidenceReference, backupRecoveryEvidenceReference: backupRecoveryEvidenceReference ?? "not-confirmed",
        ...(developmentRiskAccepted ? { developmentNoBackupAcknowledgementReference } : {}),
      },
      onProgress: (progress) => console.log(JSON.stringify({ type: "CREATOR_VERIFICATION_MIGRATION_PROGRESS", ...progress })),
    });
    console.log(JSON.stringify({ type: "CREATOR_VERIFICATION_MIGRATION_COMPLETE", database: result.database, backfill: result.backfill, legacyIndexesRetained: result.legacyIndexesRetained, typedIndexes: result.typedIndexes }));
  } finally {
    await client.close();
  }
};

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
