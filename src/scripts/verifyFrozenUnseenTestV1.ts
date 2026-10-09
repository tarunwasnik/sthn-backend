import { loadUnseenManifest, unseenTestRoot } from "../evaluation/imageModeration/dataset/unseenTestV1Intake.service";
import { verifyFrozenCorpus } from "../evaluation/imageModeration/dataset/unseenTestV1Freeze.service";
import { loadUnseenReviewManifest } from "../evaluation/imageModeration/dataset/unseenTestV1Review.service";
(async()=>{const root=unseenTestRoot(),result=await verifyFrozenCorpus(root,await loadUnseenManifest(root),await loadUnseenReviewManifest(root));console.log(JSON.stringify({path:result.path,sha256:result.sha256,status:"VERIFIED"},null,2));})().catch(error=>{console.error(error);process.exitCode=1});
