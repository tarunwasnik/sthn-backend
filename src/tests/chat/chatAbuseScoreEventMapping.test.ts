import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sourceRoot = join(__dirname, "..", "..");
const chatController = readFileSync(
  join(sourceRoot, "controllers", "chat.controller.ts"),
  "utf8",
);
const abuseScoreService = readFileSync(
  join(sourceRoot, "services", "abuseScore.service.ts"),
  "utf8",
);
const cooldownEngine = readFileSync(
  join(sourceRoot, "services", "cooldownEngine.service.ts"),
  "utf8",
);

const contactIntentBranch = chatController.match(
  /if \(moderation\.hasContactIntent\) \{([\s\S]*?)\n  \}/,
);

test("chat contact intent maps to chat-specific abuse events", () => {
  assert.ok(contactIntentBranch, "chat contact-intent branch must exist");
  const branch = contactIntentBranch[1];

  assert.match(branch, /booking\.hasInteracted\s*\?\s*"CHAT_CONTACT_AFTER_INTERACTION"\s*:\s*"CHAT_CONTACT_ATTEMPT"/);
  assert.doesNotMatch(branch, /USER_CANCEL_(?:EARLY|AFTER_INTERACTION)/);
});

test("chat abuse and cancellation scores retain their canonical values", () => {
  assert.match(abuseScoreService, /CHAT_CONTACT_ATTEMPT:\s*8/);
  assert.match(abuseScoreService, /CHAT_CONTACT_AFTER_INTERACTION:\s*20/);
  assert.match(abuseScoreService, /USER_CANCEL_EARLY:\s*1/);
  assert.match(abuseScoreService, /USER_CANCEL_AFTER_INTERACTION:\s*15/);
});

test("ordinary chat messages do not invoke the abuse-score path", () => {
  assert.ok(contactIntentBranch, "chat contact-intent branch must exist");
  const beforeContactBranch = chatController.slice(0, contactIntentBranch.index);
  assert.doesNotMatch(beforeContactBranch, /applyAbuseScore\(/);
});

test("existing cooldown thresholds remain unchanged", () => {
  assert.match(cooldownEngine, /score\s*>=\s*80[\s\S]*?nowPlus\(90 \* 24\)/);
  assert.match(cooldownEngine, /score\s*>=\s*60[\s\S]*?nowPlus\(30 \* 24\)/);
  assert.match(cooldownEngine, /score\s*>=\s*40[\s\S]*?nowPlus\(7 \* 24\)/);
  assert.match(cooldownEngine, /score\s*>=\s*20[\s\S]*?nowPlus\(24\)/);
});
