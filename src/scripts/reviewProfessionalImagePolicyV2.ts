import { createProfessionalImagePolicyV2ReviewServer } from "../evaluation/imageModeration/dataset/professionalImagePolicyV2ReviewServer";
createProfessionalImagePolicyV2ReviewServer().then(({ url }) => console.log(`STHN Professional Image Policy V2 reviewer: ${url}`)).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
