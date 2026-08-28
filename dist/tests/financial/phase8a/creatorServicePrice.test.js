"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCreatorServicePriceTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const creatorServicePrice_util_1 = require("../../../utils/financial/creatorServicePrice.util");
const registerCreatorServicePriceTests = () => {
    (0, node_test_1.test)("creator service price converts USD major-unit values to the identical minor-unit money", () => {
        strict_1.default.equal((0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(1000, "USD"), 100000);
        strict_1.default.equal((0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(1100.99, "USD"), 110099);
        strict_1.default.equal((0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(12.34, "USD"), 1234);
        strict_1.default.equal((0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(14331, "USD"), 1433100);
    });
    (0, node_test_1.test)("creator service price rejects invalid and excess-precision USD values", () => {
        for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 12.345, 1100.999]) {
            strict_1.default.throws(() => (0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(price, "USD"));
        }
    });
};
exports.registerCreatorServicePriceTests = registerCreatorServicePriceTests;
