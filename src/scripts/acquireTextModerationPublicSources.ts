import { acquireAuthorizedSources } from "../research/textModerationDataset/acquisition";

acquireAuthorizedSources().then((summary) => {
  console.log(JSON.stringify(summary.results, null, 2));
  if (summary.results.some((item) => item.status === "BLOCKED" && ["HATEMOJI_BUILD", "TOXIGEN_ANNOTATED"].includes(item.sourceId))) process.exitCode = 1;
}).catch((error) => { console.error(error); process.exitCode = 1; });
