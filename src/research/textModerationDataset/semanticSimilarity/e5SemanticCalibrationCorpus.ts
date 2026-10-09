import crypto from "node:crypto";

import { canonicalJson } from "../manifest";

export const E5_SEMANTIC_CALIBRATION_CORPUS_VERSION = "STHN_E5_SEMANTIC_NON_FROZEN_CALIBRATION_V1" as const;
export const E5_SEMANTIC_CALIBRATION_CORPUS_DIGEST = "00d54dcd95d1c20b97456ad29feb31d02c3064e4129a4a96f8ddf1d1b777e7d5" as const;
export const E5_CALIBRATION_PAIR_CLASSES = ["EXACT_IDENTITY", "SURFACE_VARIANT", "STRONG_PARAPHRASE", "LIGHT_PARAPHRASE",
  "SAME_TOPIC_DIFFERENT_MEANING", "POLICY_CHANGING_MINIMAL_PAIR", "UNRELATED", "MULTILINGUAL_EQUIVALENCE", "HINGLISH"] as const;
export type E5CalibrationPairClass = typeof E5_CALIBRATION_PAIR_CLASSES[number];
export type E5ExpectedRelationship = "EQUIVALENT" | "DISTINCT";

export interface E5CalibrationPair {
  readonly id: string; readonly pairClass: E5CalibrationPairClass; readonly languageGroup: string;
  readonly expectedRelationship: E5ExpectedRelationship; readonly left: string; readonly right: string;
}

const pairs = (pairClass: E5CalibrationPairClass, expectedRelationship: E5ExpectedRelationship,
  values: readonly (readonly [string, string, string])[]): E5CalibrationPair[] => values.map(([languageGroup, left, right], index) => ({
    id: `${pairClass}_${String(index + 1).padStart(2, "0")}`, pairClass, languageGroup, expectedRelationship, left, right,
  }));

export const e5SemanticCalibrationCorpus: readonly E5CalibrationPair[] = Object.freeze([
  ...pairs("EXACT_IDENTITY", "EQUIVALENT", [["en", "The community garden opens on Saturday.", "The community garden opens on Saturday."], ["hi", "आज पुस्तकालय खुला है।", "आज पुस्तकालय खुला है।"], ["th", "รถไฟออกเวลาเก้าโมง", "รถไฟออกเวลาเก้าโมง"], ["hinglish", "Kal meeting dus baje hai.", "Kal meeting dus baje hai."]]),
  ...pairs("SURFACE_VARIANT", "EQUIVALENT", [["en", "Please bring the blue notebook.", "  please   bring the blue notebook  "], ["en", "Workshop starts at 4 pm!", "WORKSHOP STARTS AT 4 PM"], ["hi", "यह कमरा शांत है।", "यह  कमरा शांत है"], ["hinglish", "Aaj class online hai!", "aaj   class online hai"]]),
  ...pairs("STRONG_PARAPHRASE", "EQUIVALENT", [["en", "The store will close before sunset.", "Customers must finish shopping while it is still daylight."], ["en", "She postponed the appointment because she was ill.", "Her sickness caused the meeting to be moved to a later date."], ["hi", "बारिश के कारण मैच रद्द हो गया।", "वर्षा होने की वजह से खेल नहीं हुआ।"], ["th", "เขาเดินทางโดยรถไฟเพราะถนนปิด", "ถนนปิดจึงทำให้เขาเลือกนั่งรถไฟ"], ["es", "El museo no abre los lunes.", "Los lunes el museo permanece cerrado."]]),
  ...pairs("LIGHT_PARAPHRASE", "EQUIVALENT", [["en", "The parcel arrived this morning.", "The package was delivered this morning."], ["en", "Turn off the lamp before leaving.", "Please switch the light off when you leave."], ["hi", "कृपया दरवाज़ा बंद करें।", "कृपया दरवाज़े को बंद कर दें।"], ["th", "กรุณาปิดหน้าต่างก่อนออกไป", "ก่อนออกไปช่วยปิดหน้าต่างด้วย"], ["hinglish", "Mujhe kal report bhejna.", "Kal mujhe report send kar dena."]]),
  ...pairs("SAME_TOPIC_DIFFERENT_MEANING", "DISTINCT", [["en", "The café opens at six in the morning.", "The café closes at six in the evening."], ["en", "The committee approved the proposal.", "The committee rejected the proposal."], ["en", "The medicine should be stored in a refrigerator.", "The medicine should never be refrigerated."], ["hi", "बस दिल्ली जा रही है।", "बस दिल्ली से आ रही है।"], ["th", "นักเรียนสอบผ่านทุกคน", "ไม่มีนักเรียนคนใดสอบผ่าน"]]),
  ...pairs("POLICY_CHANGING_MINIMAL_PAIR", "DISTINCT", [["en", "I will help you tomorrow.", "I will hurt you tomorrow."], ["en", "Send me the public office number.", "Send me her private home number."], ["en", "The adults discussed health education.", "The adults requested explicit sexual content."], ["en", "I dislike the damaged chair.", "I want to attack the person in that chair."], ["hi", "मैं तुम्हारी सहायता करूँगा।", "मैं तुम्हें नुकसान पहुँचाऊँगा।"], ["hinglish", "Main tumhari help karunga.", "Main tumhe hurt karunga."]]),
  ...pairs("UNRELATED", "DISTINCT", [["en", "A violin needs regular tuning.", "The mountain road is covered in snow."], ["en", "Fresh bread is cooling on the rack.", "Satellites orbit far above the atmosphere."], ["en-hi", "The conference begins after lunch.", "बिल्ली खिड़की के पास सो रही है।"], ["en-th", "The printer needs more paper.", "ชาวสวนกำลังปลูกมะม่วง"], ["hi-th", "समुद्र आज शांत है।", "คอมพิวเตอร์เครื่องนี้ต้องอัปเดต"]]),
  ...pairs("MULTILINGUAL_EQUIVALENCE", "EQUIVALENT", [["en-hi", "The train arrives at noon.", "ट्रेन दोपहर में पहुँचती है।"], ["en-hi", "Children are reading in the library.", "बच्चे पुस्तकालय में पढ़ रहे हैं।"], ["en-th", "Please close the window.", "กรุณาปิดหน้าต่าง"], ["en-th", "The market is busy this morning.", "เช้านี้ตลาดมีคนพลุกพล่าน"], ["en-es", "The meeting starts at nine.", "La reunión comienza a las nueve."], ["en-es", "The keys are inside the drawer.", "Las llaves están dentro del cajón."]]),
  ...pairs("HINGLISH", "EQUIVALENT", [["hinglish-en", "Kal office band rahega.", "The office will remain closed tomorrow."], ["hinglish-en", "Please chai table par rakh do.", "Please put the tea on the table."], ["hinglish-hi", "Bacche garden mein khel rahe hain.", "बच्चे बगीचे में खेल रहे हैं।"], ["hinglish-hi", "Mujhe station jaana hai.", "मुझे स्टेशन जाना है।"]]),
]);

export const e5SemanticCalibrationCorpusDigest = (): string => crypto.createHash("sha256")
  .update(canonicalJson({ version: E5_SEMANTIC_CALIBRATION_CORPUS_VERSION, pairs: e5SemanticCalibrationCorpus })).digest("hex");
