import assert from "node:assert/strict";
import test from "node:test";

import { calculateCancellationPolicy, CancellationPolicyInput, CancellationScenario } from "../../services/financial/cancellationPolicyCalculation.service";

const HOUR = 3_600_000;
const base: CancellationPolicyInput = { serviceAmount: 100_000, customerPlatformFee: 5_000, originalChargeTotal: 105_000, currency: "INR", scenario: "CUSTOMER_AFTER_ACCEPTANCE", qualifyingTwoWayInteraction: false, scheduledStartMs: 2_000_000_000_000, cancellationReceivedMs: 2_000_000_000_000 - 49 * HOUR };
const calculate = (scenario: CancellationScenario, overrides: Partial<CancellationPolicyInput> = {}) => {
  const result = calculateCancellationPolicy({ ...base, scenario, ...overrides });
  assert.equal(result.totalCustomerRefund + result.creatorEntitlement + result.sthnEntitlement, result.originalChargeTotal);
  assert.ok(Object.isFrozen(result));
  return result;
};
const allocation = (result: ReturnType<typeof calculate>) => [result.totalCustomerRefund, result.creatorEntitlement, result.sthnEntitlement];

test("authoritative INR 1000 fixtures reconcile for every main scenario", () => {
  const rows: Array<[CancellationScenario, Partial<CancellationPolicyInput>, number[]]> = [
    ["CUSTOMER_BEFORE_ACCEPTANCE", { qualifyingTwoWayInteraction: true }, [105_000, 0, 0]],
    ["CUSTOMER_AFTER_ACCEPTANCE", {}, [105_000, 0, 0]],
    ...([[48, 95_000, 4_000, 6_000], [24, 90_000, 8_000, 7_000], [6, 80_000, 16_000, 9_000], [1, 60_000, 32_000, 13_000]] as const).map(([hours, refund, creator, platform]): [CancellationScenario, Partial<CancellationPolicyInput>, number[]] => ["CUSTOMER_AFTER_ACCEPTANCE", { cancellationReceivedMs: base.scheduledStartMs - hours * HOUR }, [refund, creator, platform]]),
    ["CUSTOMER_AFTER_ACCEPTANCE", { cancellationReceivedMs: base.scheduledStartMs - HOUR, qualifyingTwoWayInteraction: true }, [45_000, 44_000, 16_000]],
    ["CREATOR_CANCELLATION", { qualifyingTwoWayInteraction: true }, [85_000, 0, 20_000]],
    ["CREATOR_CANCELLATION", {}, [105_000, 0, 0]],
    ["MUTUAL_CANCELLATION", { qualifyingTwoWayInteraction: true }, [85_000, 0, 20_000]],
    ["MUTUAL_CANCELLATION", {}, [105_000, 0, 0]],
    ["ADMIN_APPROVED_PARTIAL_DELIVERY", { approvedDeliveredValue: 30_000 }, [70_000, 24_000, 11_000]],
    ["VERIFIED_PLATFORM_FAILURE", { qualifyingTwoWayInteraction: true }, [105_000, 0, 0]],
  ];
  for (const [scenario, input, expected] of rows) assert.deepEqual(allocation(calculate(scenario, input)), expected, scenario);
});

test("each time boundary selects the higher penalty at the boundary and one second either side", () => {
  const rows = [[48, 0, 5, 5], [24, 5, 10, 10], [6, 10, 20, 20], [1, 20, 40, 40]];
  for (const [hours, earlierRate, exactRate, laterRate] of rows) {
    for (const [delta, rate] of [[-1000, earlierRate], [0, exactRate], [1000, laterRate]]) {
      const result = calculate("CUSTOMER_AFTER_ACCEPTANCE", { cancellationReceivedMs: base.scheduledStartMs - hours * HOUR + delta });
      assert.equal(result.timeDeduction, rate * 1_000, `${hours}h delta ${delta}`);
    }
  }
});

test("no-shows, medical exception and pressure follow their respective authorized outcomes", () => {
  for (const interaction of [false, true]) {
    assert.deepEqual(allocation(calculate("CUSTOMER_NO_SHOW", { qualifyingTwoWayInteraction: interaction })), interaction ? [45_000, 44_000, 16_000] : [60_000, 32_000, 13_000]);
    const creator = interaction ? [85_000, 0, 20_000] : [105_000, 0, 0];
    assert.deepEqual(allocation(calculate("CREATOR_NO_SHOW", { qualifyingTwoWayInteraction: interaction })), creator);
    assert.deepEqual(allocation(calculate("AUTHORIZED_CREATOR_PRESSURE", { qualifyingTwoWayInteraction: interaction })), creator);
    assert.deepEqual(allocation(calculate("AUTHORIZED_MEDICAL_EMERGENCY", { qualifyingTwoWayInteraction: interaction })), interaction ? [85_000, 12_000, 8_000] : [105_000, 0, 0]);
  }
});

test("partial delivery at zero, intermediate and full value does not add interaction charges", () => {
  for (const [value, expected] of [[0, [100_000, 0, 5_000]], [30_000, [70_000, 24_000, 11_000]], [100_000, [0, 80_000, 25_000]]] as const) {
    const result = calculate("ADMIN_APPROVED_PARTIAL_DELIVERY", { approvedDeliveredValue: value, qualifyingTwoWayInteraction: true });
    assert.deepEqual(allocation(result), expected);
    assert.equal(result.approvedDeliveredValue, value);
    assert.equal(result.totalServiceDeduction, 0);
    assert.equal(result.interactionDeduction, 0);
  }
});

test("minor-unit half-up rounding works for fractional and zero-decimal currencies", () => {
  const small = { serviceAmount: 17, customerPlatformFee: 1, originalChargeTotal: 18, cancellationReceivedMs: base.scheduledStartMs - HOUR, qualifyingTwoWayInteraction: true };
  for (const currency of ["INR", "JPY"] as const) {
    const result = calculate("CUSTOMER_AFTER_ACCEPTANCE", { ...small, currency });
    assert.equal(result.timeDeduction, 7);
    assert.equal(result.interactionDeduction, 2);
    assert.equal(result.totalServiceDeduction, 9);
    assert.deepEqual(allocation(result), [8, 7, 3]);
  }
});

test("invalid snapshots, timestamps, currency, scenarios, arbitrary rates and overflow are rejected", () => {
  const invalid: Array<Record<string, unknown>> = [
    { serviceAmount: -1 }, { serviceAmount: 0 }, { customerPlatformFee: -1 }, { serviceAmount: 1.5 },
    { originalChargeTotal: 1 }, { currency: "ZZZ" }, { currency: "inr" }, { scenario: "INVALID" },
    { scheduledStartMs: NaN }, { cancellationReceivedMs: 8_640_000_000_000_001 },
    { qualifyingTwoWayInteraction: "yes" }, { serviceAmount: Number.MAX_SAFE_INTEGER, customerPlatformFee: 1, originalChargeTotal: Number.MAX_SAFE_INTEGER },
    { scenario: "ADMIN_APPROVED_PARTIAL_DELIVERY", approvedDeliveredValue: 100_001 },
    { scenario: "ADMIN_APPROVED_PARTIAL_DELIVERY", approvedDeliveredValue: -1 },
    { scenario: "ADMIN_APPROVED_PARTIAL_DELIVERY" }, { approvedDeliveredValue: 0 }, { timeRate: 0 },
  ];
  for (const changes of invalid) assert.throws(() => calculateCancellationPolicy({ ...base, ...changes } as CancellationPolicyInput), JSON.stringify(changes));
});
