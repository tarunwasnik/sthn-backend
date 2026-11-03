import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { QWEN3_VL_PILOT_20 } from "../evaluation/imageModeration/qwen3VlPilot20.manifest";

type InventoryCandidate = Readonly<{ id: string; localAsset: string; sha256: string }>;
type PilotRow = Readonly<{
  fixtureId: string;
  contextTags: readonly string[];
  humanDecision: "PASS" | "BLOCK";
  humanCategories: readonly string[];
  adamCoddDecision: "PASS" | "BLOCK" | null;
  qwenStatus: "PASS" | "BLOCK" | "UNCERTAIN" | "ERROR" | "UNAVAILABLE";
  qwenCategories: readonly string[];
  qwenRationale: string | null;
  assessment: "CORRECT" | "INCORRECT" | "UNCERTAIN" | "ERROR" | "UNAVAILABLE";
}>;
type PilotReport = Readonly<{ rows: readonly PilotRow[] }>;

const root = process.cwd();
const benchmarkRoot = path.join(root, "evaluation-cache", "image-moderation", "benchmark");
const pilotOutputDirectory = path.join(root, "evaluation-output", "image-moderation", "qwen3-vl-v2b2a-pilot20");
const reportPath = path.join(pilotOutputDirectory, "pilot-report.json");
const galleryPath = path.join(pilotOutputDirectory, "qwen-pilot-visual-gallery.html");
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const toStringArray = (value: unknown): readonly string[] => Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];

const relativeImageSource = (assetPath: string) => path.relative(pilotOutputDirectory, assetPath).split(path.sep).map(encodeURIComponent).join("/");

const parseInventory = (value: unknown): readonly InventoryCandidate[] => {
  if (!isRecord(value) || !Array.isArray(value.candidates)) throw new Error("Qwen visual gallery inventory manifest is invalid");
  return value.candidates.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.localAsset !== "string" || typeof candidate.sha256 !== "string") throw new Error("Qwen visual gallery inventory candidate is invalid");
    return { id: candidate.id, localAsset: candidate.localAsset, sha256: candidate.sha256 };
  });
};

const parseReport = (value: unknown): PilotReport => {
  if (!isRecord(value) || !Array.isArray(value.rows)) throw new Error("Qwen visual gallery pilot report is invalid");
  const rows = value.rows.map((row): PilotRow => {
    if (!isRecord(row) || typeof row.fixtureId !== "string" || (row.humanDecision !== "PASS" && row.humanDecision !== "BLOCK") || (row.adamCoddDecision !== "PASS" && row.adamCoddDecision !== "BLOCK" && row.adamCoddDecision !== null) || (row.qwenStatus !== "PASS" && row.qwenStatus !== "BLOCK" && row.qwenStatus !== "UNCERTAIN" && row.qwenStatus !== "ERROR" && row.qwenStatus !== "UNAVAILABLE") || (row.assessment !== "CORRECT" && row.assessment !== "INCORRECT" && row.assessment !== "UNCERTAIN" && row.assessment !== "ERROR" && row.assessment !== "UNAVAILABLE") || (typeof row.qwenRationale !== "string" && row.qwenRationale !== null)) throw new Error("Qwen visual gallery pilot row is invalid");
    return { fixtureId: row.fixtureId, contextTags: toStringArray(row.contextTags), humanDecision: row.humanDecision, humanCategories: toStringArray(row.humanCategories), adamCoddDecision: row.adamCoddDecision, qwenStatus: row.qwenStatus, qwenCategories: toStringArray(row.qwenCategories), qwenRationale: row.qwenRationale, assessment: row.assessment };
  });
  return { rows };
};

const renderCard = (input: Readonly<{ index: number; row: PilotRow; assetPath: string }>) => {
  const disagreement = input.row.adamCoddDecision !== input.row.qwenStatus;
  const qwenCategories = input.row.qwenCategories.length ? input.row.qwenCategories.join(", ") : "None";
  const humanCategories = input.row.humanCategories.length ? input.row.humanCategories.join(", ") : "None";
  const reason = input.row.qwenRationale ?? "No saved Qwen reason.";
  const source = relativeImageSource(input.assetPath);
  return `<article class="card outcome-${input.row.assessment.toLowerCase()}${disagreement ? " model-disagreement" : ""}" data-outcome="${input.row.assessment}" data-disagreement="${disagreement}">
  <button class="image-button" type="button" data-full-src="${escapeHtml(source)}" data-caption="Image ${input.index}: ${escapeHtml(input.row.fixtureId)}" aria-label="Open Image ${input.index} at full size"><img src="${escapeHtml(source)}" alt="Pilot fixture ${input.index}: ${escapeHtml(input.row.fixtureId)}" loading="lazy"></button>
  <div class="body">
    <h2>Image ${input.index} <code>${escapeHtml(input.row.fixtureId)}</code></h2>
    <p class="badges"><span class="badge human-${input.row.humanDecision.toLowerCase()}">Human ${input.row.humanDecision}</span><span class="badge adam-${(input.row.adamCoddDecision ?? "missing").toLowerCase()}">AdamCodd ${input.row.adamCoddDecision ?? "Missing"}</span><span class="badge qwen-${input.row.qwenStatus.toLowerCase()}">Qwen ${input.row.qwenStatus}</span><span class="badge outcome">${input.row.assessment}</span></p>
    <dl><dt>Context</dt><dd>${escapeHtml(input.row.contextTags.join(", ") || "None")}</dd><dt>Human categories</dt><dd>${escapeHtml(humanCategories)}</dd><dt>Qwen categories</dt><dd>${escapeHtml(qwenCategories)}</dd><dt>Exact Qwen reason</dt><dd class="reason">${escapeHtml(reason)}</dd></dl>
  </div>
</article>`;
};

void (async () => {
  const [inventoryRaw, reportRaw] = await Promise.all([readFile(path.join(benchmarkRoot, "inventory-manifest.json"), "utf8"), readFile(reportPath, "utf8")]);
  const inventory = new Map(parseInventory(JSON.parse(inventoryRaw)).map((candidate) => [candidate.id, candidate]));
  const report = parseReport(JSON.parse(reportRaw));
  const reportByFixtureId = new Map(report.rows.map((row) => [row.fixtureId, row]));
  if (report.rows.length !== 20 || reportByFixtureId.size !== 20 || QWEN3_VL_PILOT_20.length !== 20) throw new Error("Qwen visual gallery requires exactly 20 unique pilot results");
  const cards: string[] = [];
  for (const [offset, selection] of QWEN3_VL_PILOT_20.entries()) {
    const row = reportByFixtureId.get(selection.fixtureId);
    const candidate = inventory.get(selection.fixtureId);
    if (!row || !candidate || !/^[a-f0-9]{64}$/.test(candidate.sha256)) throw new Error(`Qwen visual gallery fixture metadata is unavailable: ${selection.fixtureId}`);
    const assetPath = path.resolve(benchmarkRoot, candidate.localAsset);
    if (!assetPath.startsWith(`${benchmarkRoot}${path.sep}`) || !(await stat(assetPath)).isFile()) throw new Error(`Qwen visual gallery asset is unavailable: ${selection.fixtureId}`);
    if (sha256(await readFile(assetPath)) !== candidate.sha256) throw new Error(`Qwen visual gallery asset hash mismatch: ${selection.fixtureId}`);
    cards.push(renderCard({ index: offset + 1, row, assetPath }));
  }
  const correct = report.rows.filter((row) => row.assessment === "CORRECT").length;
  const uncertain = report.rows.filter((row) => row.assessment === "UNCERTAIN").length;
  const incorrect = report.rows.filter((row) => row.assessment === "INCORRECT").length;
  if (correct !== 15 || uncertain !== 4 || incorrect !== 1) throw new Error("Qwen visual gallery result counts do not match the saved pilot report");
  try { await access(galleryPath); throw new Error("Qwen visual gallery already exists and will not be overwritten"); } catch (error) { if (error instanceof Error && error.message === "Qwen visual gallery already exists and will not be overwritten") throw error; }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>STHN Qwen Pilot Visual Review</title><style>
*{box-sizing:border-box}body{margin:0;background:#10141d;color:#eef2ff;font:15px/1.45 system-ui,sans-serif}main{max-width:1560px;margin:auto;padding:24px}.summary{background:#1b2433;border:1px solid #334155;border-radius:14px;padding:20px;margin-bottom:18px}.summary h1{margin:0 0 8px}.summary p{margin:6px 0}.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{padding:8px 12px;border-radius:8px;background:#0f172a}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.controls button{border:1px solid #64748b;background:#1e293b;color:#fff;border-radius:7px;padding:8px 10px;cursor:pointer}.controls button.active{background:#2563eb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.card{background:#182131;border:1px solid #334155;border-radius:12px;overflow:hidden}.card.outcome-incorrect{border-color:#ef4444}.card.outcome-uncertain{border-color:#f59e0b}.card.model-disagreement{box-shadow:0 0 0 1px #7c3aed}.image-button{width:100%;padding:0;border:0;background:#020617;cursor:zoom-in}.image-button img{width:100%;height:360px;object-fit:contain;display:block}.body{padding:14px}.body h2{font-size:15px;margin:0 0 9px;overflow-wrap:anywhere}.badges{display:flex;gap:6px;flex-wrap:wrap}.badge{padding:3px 7px;border-radius:999px;font-size:12px;background:#334155}.human-pass,.qwen-pass,.adam-pass{background:#166534}.human-block,.qwen-block,.adam-block{background:#991b1b}.qwen-uncertain{background:#92400e}.outcome{background:#374151}dl{margin:10px 0 0;display:grid;grid-template-columns:120px 1fr;gap:6px}dt{font-weight:700;color:#a5b4fc}dd{margin:0;overflow-wrap:anywhere}.reason{white-space:pre-wrap}dialog{width:min(96vw,1400px);height:min(94vh,1000px);padding:0;background:#020617;color:#fff;border:1px solid #64748b}dialog::backdrop{background:#000c}.modal-head{display:flex;justify-content:space-between;padding:10px}.modal-head button{font-size:20px;background:none;color:#fff;border:0;cursor:pointer}.modal-image{width:100%;height:calc(100% - 52px);object-fit:contain}@media(max-width:600px){main{padding:12px}.image-button img{height:300px}dl{grid-template-columns:1fr}}
</style></head><body><main><section class="summary"><h1>STHN Qwen3-VL 20-Image Pilot — Visual Review</h1><p>Offline, read-only gallery. Images are referenced from the existing frozen local benchmark; no image copies, uploads, or inference were created.</p><div class="stats"><span class="stat">20 total</span><span class="stat">15 correct</span><span class="stat">4 uncertain</span><span class="stat">1 incorrect</span></div></section><nav class="controls" aria-label="Gallery filters"><button class="active" data-filter="ALL">All 20 images</button><button data-filter="CORRECT">Qwen correct</button><button data-filter="INCORRECT">Qwen incorrect</button><button data-filter="UNCERTAIN">Qwen uncertain</button><button data-filter="DISAGREEMENT">AdamCodd/Qwen disagreements</button></nav><section class="grid" id="gallery">${cards.join("\n")}</section></main><dialog id="viewer"><div class="modal-head"><span id="caption"></span><button type="button" id="close" aria-label="Close">×</button></div><img id="modal-image" class="modal-image" alt=""></dialog><script>
const cards=[...document.querySelectorAll('.card')],buttons=[...document.querySelectorAll('[data-filter]')];for(const button of buttons)button.addEventListener('click',()=>{const filter=button.dataset.filter;for(const candidate of buttons)candidate.classList.toggle('active',candidate===button);for(const card of cards)card.hidden=!(filter==='ALL'||card.dataset.outcome===filter||(filter==='DISAGREEMENT'&&card.dataset.disagreement==='true'));});const viewer=document.querySelector('#viewer'),modalImage=document.querySelector('#modal-image'),caption=document.querySelector('#caption');for(const button of document.querySelectorAll('.image-button'))button.addEventListener('click',()=>{modalImage.src=button.dataset.fullSrc;modalImage.alt=button.dataset.caption;caption.textContent=button.dataset.caption;viewer.showModal();});document.querySelector('#close').addEventListener('click',()=>viewer.close());viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
</script></body></html>`;
  await writeFile(galleryPath, html, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ galleryPath, images: cards.length, correct, uncertain, incorrect }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
