import { createHash } from "node:crypto";

export const PROFESSIONAL_IMAGE_POLICY_V2_ID = "STHN_PROFESSIONAL_IMAGE_POLICY_V2" as const;
export const PROFESSIONAL_IMAGE_POLICY_V2_VERSION = "2.0.0" as const;
export const PROFESSIONAL_IMAGE_POLICY_V2_SCHEMA = "STHN_I4_G1_PROFESSIONAL_IMAGE_POLICY_V2_FREEZE_V1" as const;

export const policyFingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const professionalImagePolicyV2Payload = () => ({
  schemaVersion: PROFESSIONAL_IMAGE_POLICY_V2_SCHEMA,
  policy: { id: PROFESSIONAL_IMAGE_POLICY_V2_ID, version: PROFESSIONAL_IMAGE_POLICY_V2_VERSION, status: "FROZEN_PRODUCT_POLICY" as const },
  purpose: "Define a professional public-marketplace image policy independently of model outputs; this is not a retrospective relabeling or model-evaluation artifact.",
  productContext: "STHN is a professional service marketplace, not a general-purpose social-media, dating, or image-sharing platform. Public imagery must be appropriate for that professional marketplace context.",
  scope: { included: ["Public marketplace profile, cover, application, and service-media imagery"], excluded: ["Face Verification identity requirements", "Booking chat images", "Dispute images", "OCR or text-in-image policy", "Production admission implementation"] },
  passPrinciples: ["Ordinary and professional portraits", "Work-related or service-related imagery", "Ordinary clothing, fashion, groups, couples, sports, athletic, fitness, outdoor, and lifestyle imagery when presentation is appropriate", "Nonsexual illustrations and safe non-avatar generated imagery when otherwise compliant"],
  professionalMarketplaceBlockPrinciples: [
    { rule: "REVEALING_SWIMWEAR", meaning: "Block bikini/two-piece, highly revealing, rear-exposure, or intimate-area-emphasizing swimwear presentation when inappropriate for public professional-marketplace imagery." },
    { rule: "UNNECESSARY_SHIRTLESS_PRESENTATION", meaning: "Generally block shirtless public profile or gallery imagery when it is unnecessary for the professional marketplace; shirtlessness is not automatically nudity and no service-specific exceptions are defined by this policy freeze." },
    { rule: "EXTREMELY_REVEALING_CLOTHING", meaning: "Block presentation structured or framed around barely covering intimate areas or otherwise excessively revealing imagery. Ordinary fitted clothing, necklines, shorts, sleeveless clothing, gym wear, and uniforms are not automatic violations." },
    { rule: "SUGGESTIVE_PRESENTATION", meaning: "Block sufficiently sexualized posing, framing, body emphasis, intimate touching, or presentation even without nudity." },
    { rule: "TRANSPARENT_OR_SEMI_TRANSPARENT_EXPOSURE", meaning: "Visible prohibited intimate anatomy through material may be nudity; otherwise sufficiently sexualized or excessively revealing presentation is assessed under its actual boundary reason." }
  ],
  hardSexualSafetyBoundaries: ["Prohibited nudity", "Explicit sexual content", "Pornography"],
  preservedExistingPolicy: ["Graphic violence and gore", "Firearm prohibition and context-aware non-firearm weapon handling", "Substance-use restrictions", "Minor safety", "Animal-content policy", "Severe image-quality uncertainty or replacement", "AI-generated avatar prohibition", "Safe AI-generated non-avatar handling"],
  modelAuthority: { rule: "MODEL_OUTPUT_IS_NOT_POLICY_AUTHORITY", statement: "Original Owen SFW, NSFW, and NSFL outputs are model signals only. Neither NSFW equals STHN BLOCK nor SFW equals STHN PASS." },
  historicalImmutability: { rule: "V1_HISTORICAL_GROUND_TRUTH_REMAINS_HISTORICAL", statement: "V1 labels, F3 frozen authority, F4 results, and F5 analysis remain unchanged. A historical V1 PASS and Owen BLOCK remains a historical false block even if V2 would later assess the image differently." },
  e5oStatus: { rule: "HISTORICAL_EXPERIMENT_NOT_PRODUCTION_AUTHORITY", bestHeadSha256: "df76eec9c0c53dcd265f62fbedb9fe107d3fb754ba4a09ed71fd34743400b33d", statement: "E5O remains a historical experimental artifact and must not become production authority from current evidence. G1 creates no retraining, evaluation, threshold, or architecture work." },
  futureG2: "A future read-only impact analysis may distinguish V2-aligned historical model behavior from remaining policy conflicts without overwriting V1 labels or historical F4 results.",
  frozenEvidence: {
    developmentV1: { candidateCount: 558, candidateSetFingerprint: "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b", fixtureSetIdentity: "71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f" },
    unseenTestV1: { candidateCount: 325, candidateSetFingerprint: "f192fa35dfcbfa739ecc9d3f88e84a8f757f780b578acc5ec9820411a41e2161", reviewFingerprint: "320c679cf28f10ad82446e982a2d9afc38941f0352fb8e20f2b6493a0f6d92ec", frozenCorpusFingerprint: "19fe31e577a88a87ba94f3ab88d1ce63793b3dfcc1043a88c918c950b1947d2a", freezeArtifactSha256: "6ea1d8b7094991d507563388d220ce2835040dc1991e84e614b155b38d101641" },
    f4: { resultFingerprint: "497e5737a84c3b023b976e214ce85201847bc98dc66c70664df43623264a3937", artifactSha256: "09e37002e201c3406a892b449b00c5ef2a1e09a415ad80f2f7165eba3d981af4" },
    f5: { reportFingerprint: "46b3202381e48b1d4a139b047f2b9f2de70aed4d4e6d17453b2f3925657d9174" }
  },
  prohibitions: { modelInference: false, training: false, fineTuning: false, thresholdChange: false, productionWiring: false, humanReviewMutation: false, candidateMutation: false, historicalArtifactMutation: false }
});

export const buildProfessionalImagePolicyV2 = () => { const payload = professionalImagePolicyV2Payload(); return { ...payload, policyFingerprint: policyFingerprint(payload) }; };
