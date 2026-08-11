"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10g concurrency: ten approvals converge on one authority", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, walletConversionDecisionFixtures_1.approve)(fixture)));
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
        const values = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
        strict_1.default.equal(new Set(values.map((item) => item.decidedAt.toISOString())).size, 1);
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({}))?.status, "APPROVED");
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_APPROVED"
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
    (0, node_test_1.test)("phase10g concurrency: ten identical rejections converge", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, walletConversionDecisionFixtures_1.reject)(fixture, "ADMIN_DECLINED", "Same reason")));
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({}))?.status, "REJECTED");
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_REJECTED"
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
    (0, node_test_1.test)("phase10g concurrency: approval versus rejection race has one winner", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const settled = await Promise.allSettled([(0, walletConversionDecisionFixtures_1.approve)(fixture), (0, walletConversionDecisionFixtures_1.reject)(fixture)]);
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
        strict_1.default.equal(settled.filter((item) => item.status === "rejected").length, 1);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({});
        strict_1.default.ok(["APPROVED", "REJECTED"].includes(request.status));
        strict_1.default.equal(Boolean(request?.rejectionCode), request?.status === "REJECTED");
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: {
                $in: ["WALLET_CONVERSION_APPROVED", "WALLET_CONVERSION_REJECTED"],
            } }), 1);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
    (0, node_test_1.test)("phase10g concurrency: different rejection race preserves one payload", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const settled = await Promise.allSettled([
            (0, walletConversionDecisionFixtures_1.reject)(fixture, "ADMIN_DECLINED", "First"),
            (0, walletConversionDecisionFixtures_1.reject)(fixture, "OTHER", "Second"),
        ]);
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
        strict_1.default.equal(settled.filter((item) => item.status === "rejected").length, 1);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({});
        strict_1.default.ok([["ADMIN_DECLINED", "First"], ["OTHER", "Second"]]
            .some(([code, reason]) => request?.rejectionCode === code &&
            request?.rejectionReason === reason));
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
