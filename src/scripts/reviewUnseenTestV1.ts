import { createUnseenTestV1ReviewServer } from "../evaluation/imageModeration/dataset/unseenTestV1ReviewServer";
createUnseenTestV1ReviewServer().then(({url})=>console.log(`STHN Unseen Test V1 human reviewer: ${url}`)).catch(error=>{console.error(error);process.exitCode=1});
