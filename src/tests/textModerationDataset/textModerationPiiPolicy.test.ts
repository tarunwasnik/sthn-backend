import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  AUTOMATIC_PII_FINDINGS_V1, createTextModerationPiiPolicy, DATASET_PII_FINDING_FAMILIES, DATASET_PII_STATUSES,
  HUMAN_REVIEW_ONLY_PII_CLASSES, publishTextModerationPiiPolicy, screenSyntheticTextUnderPiiPolicy,
  TEXT_MODERATION_PII_DETECTOR_VERSION, TEXT_MODERATION_PII_POLICY_FILENAME, TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST,
  TEXT_MODERATION_PII_POLICY_SCHEMA, TEXT_MODERATION_PII_POLICY_SHA256, TEXT_MODERATION_PII_POLICY_VERSION,
  TextModerationPiiPolicyArtifact, validateTextModerationPiiPolicy,
} from "../../research/textModerationDataset/textModerationPiiPolicy";

const artifactPath = path.resolve(process.cwd(), "dataset-research/text-moderation/policy", TEXT_MODERATION_PII_POLICY_FILENAME);
const bytes = fs.readFileSync(artifactPath), artifact = JSON.parse(bytes.toString("utf8")) as TextModerationPiiPolicyArtifact;
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");

test("01 canonical PII taxonomy preserved", () => assert.deepEqual(artifact.taxonomy, DATASET_PII_STATUSES));
test("02 NONE semantics explicit", () => assert.deepEqual([artifact.semantics.NONE.automaticAssignmentAllowed, artifact.semantics.NONE.completenessClaim], [true, false]));
test("03 REQUIRES_REVIEW semantics explicit", () => assert.deepEqual([artifact.semantics.REQUIRES_REVIEW.progressionToModerationAllowed, artifact.semantics.REQUIRES_REVIEW.failClosed], [false, true]));
test("04 EXCLUDE semantics explicit", () => assert.deepEqual([artifact.semantics.EXCLUDE.automaticAssignmentAllowed, artifact.semantics.EXCLUDE.requiresHumanConfirmation], [false, true]));
test("05 REDACTED semantics explicit", () => assert.deepEqual([artifact.semantics.REDACTED.automaticAssignmentAllowed, artifact.semantics.REDACTED.futureAuthorityRequired], [false, true]));
test("06 automatic redaction explicit", () => assert.deepEqual([artifact.detectorContract.automaticRedaction, artifact.semantics.REDACTED.automaticRedaction], [false, "DISABLED"]));
test("07 supported classes bounded", () => assert.deepEqual(artifact.supportedAutomaticFindings, AUTOMATIC_PII_FINDINGS_V1));
test("08 unsupported classes listed", () => assert.deepEqual(artifact.unsupportedContextSensitiveClasses, HUMAN_REVIEW_ONLY_PII_CLASSES));
test("09 person-name policy explicit", () => assert.deepEqual([artifact.subjectPolicies.names.ordinaryOrPublicPersonReference, artifact.subjectPolicies.names.automaticNerAuthorized], ["NOT_PII_BY_ITSELF", false]));
test("10 address and location policy explicit", () => assert.deepEqual([artifact.subjectPolicies.addressAndLocation.countryCityStateOrPlaceReference, artifact.subjectPolicies.addressAndLocation.precisePrivateAddress], ["NOT_PII_BY_ITSELF", "HUMAN_REVIEW_ONLY"]));
test("11 URL policy explicit", () => assert.equal(artifact.subjectPolicies.urls.standaloneUrl, "NOT_PII_BY_ITSELF"));
test("12 handle policy explicit", () => assert.deepEqual([artifact.subjectPolicies.handles.standaloneHandle, artifact.subjectPolicies.handles.chatContactIntentHelperIsAuthority], ["NOT_PII_BY_ITSELF", false]));
test("13 organization policy explicit", () => assert.equal(artifact.subjectPolicies.organizations.ordinaryOrganizationOrPublicEntity, "NOT_PII_BY_ITSELF"));
test("14 ambiguous-number policy explicit", () => assert.deepEqual([artifact.subjectPolicies.ambiguousNumbers.yearsAndShortNumbers, artifact.subjectPolicies.ambiguousNumbers.outcome], ["NOT_BLINDLY_CLASSIFIED", "REQUIRES_REVIEW"]));
test("15 detector safeguards present", () => assert.deepEqual([artifact.detectorContract.normalization, artifact.detectorContract.exactTextRequired, artifact.detectorContract.outputStoresRawMatch], ["UNICODE_NFKC_FOR_DETECTION_ONLY", true, false]));
test("16 false-positive safeguards present", () => assert.ok(artifact.falsePositiveSafeguards.length >= 5));
test("17 known limitations present", () => assert.ok(artifact.knownLimitations.length >= 6));
test("18 human fallback present", () => assert.deepEqual([artifact.humanReviewFallback.role, artifact.humanReviewFallback.phaseMustBeSeparatelyAuthorized], ["HUMAN_PII_REVIEWER", true]));
test("19 disposition matrix complete", () => assert.equal(artifact.dispositionMatrix.length, AUTOMATIC_PII_FINDINGS_V1.length + 2));
test("20 moderation measurements cannot affect policy", () => assert.equal(artifact.independence.consumesSourceModerationMeasurements, false));
test("21 proposal stratum cannot affect disposition", () => assert.equal(artifact.independence.consumesProposalStratum, false));
test("22 synthetic email deterministic", () => { const a = screenSyntheticTextUnderPiiPolicy("Contact hello@example.com"); assert.deepEqual(a, screenSyntheticTextUnderPiiPolicy("Contact hello@example.com")); assert.deepEqual([a.findingClasses, a.automaticStatus], [["EMAIL_PATTERN"], "REQUIRES_REVIEW"]); });
test("23 synthetic phone deterministic", () => assert.deepEqual(screenSyntheticTextUnderPiiPolicy("Call +1 202-555-0100").findingClasses, ["PHONE_PATTERN_STRONG"]));
test("24 ordinary year is not phone or account PII", () => assert.deepEqual(screenSyntheticTextUnderPiiPolicy("The year is 2026"), { detectorVersion: TEXT_MODERATION_PII_DETECTOR_VERSION, findingClasses: [], automaticStatus: "NONE", requiresHumanPiiReview: false }));
test("25 ordinary broad location follows policy", () => assert.equal(screenSyntheticTextUnderPiiPolicy("Bangkok").automaticStatus, "NONE"));
test("26 ordinary organization follows policy", () => assert.equal(screenSyntheticTextUnderPiiPolicy("OpenAI").automaticStatus, "NONE"));
test("27 contextual PII ambiguity rule explicit", () => { assert.ok(artifact.dispositionMatrix.some((row) => row.findingClass === "EXTERNALLY_SURFACED_CONTEXT_SENSITIVE_CLASS" && row.automaticStatus === "REQUIRES_REVIEW")); assert.ok(DATASET_PII_FINDING_FAMILIES.includes("OTHER_CONTEXT_SENSITIVE_PII")); });
test("28 policy artifact canonical", () => { assert.deepEqual([artifact.schemaVersion, artifact.policyVersion, sha(bytes), artifact.policyPayloadDigest], [TEXT_MODERATION_PII_POLICY_SCHEMA, TEXT_MODERATION_PII_POLICY_VERSION, TEXT_MODERATION_PII_POLICY_SHA256, TEXT_MODERATION_PII_POLICY_PAYLOAD_DIGEST]); assert.equal(bytes.toString("utf8"), canonicalJson(artifact)); assert.doesNotThrow(() => validateTextModerationPiiPolicy(artifact)); });
test("29 overwrite refused", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-pii-policy-overwrite-")), target = path.join(dir, TEXT_MODERATION_PII_POLICY_FILENAME); try { fs.writeFileSync(target, "existing"); assert.throws(() => publishTextModerationPiiPolicy(artifact, target), /overwrite refused/); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("30 publication failure leaves no authority", () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-pii-policy-failure-")), target = path.join(dir, TEXT_MODERATION_PII_POLICY_FILENAME); try { assert.throws(() => publishTextModerationPiiPolicy(artifact, target, () => { throw new Error("simulated publication failure"); }), /simulated publication failure/); assert.deepEqual(fs.readdirSync(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
test("31 no 400-candidate screening", () => { assert.equal(artifact.scope.candidateScreeningPerformed, false); assert.equal(artifact.independence.screensRealCandidatesInThisPhase, false); const moduleSource = fs.readFileSync(path.resolve(process.cwd(), "src/research/textModerationDataset/textModerationPiiPolicy.ts"), "utf8"); assert.doesNotMatch(moduleSource, /mhs-v2-expansion-candidates-v1\.json/); });
test("32 no moderation labels", () => assert.deepEqual([artifact.independence.assignsModerationDecision, artifact.independence.assignsModerationCategory], [false, false]));
test("33 no human review", () => assert.equal(artifact.humanReviewFallback.phaseMustBeSeparatelyAuthorized, true));
test("34 INTERNAL_TEST untouched", () => assert.equal(artifact.independence.accessesInternalTest, false));
test("35 frozen 140 untouched", () => assert.equal(artifact.independence.accessesFrozen140, false));
test("36 no training or inference", () => { assert.deepEqual([artifact.independence.runsModelInference, artifact.independence.performsTraining], [false, false]); assert.deepEqual(createTextModerationPiiPolicy(), artifact); assert.throws(() => screenSyntheticTextUnderPiiPolicy("hello", "UNSUPPORTED"), /Unsupported/); });
