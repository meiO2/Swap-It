import assert from "node:assert/strict";
import test from "node:test";
import {
  getApplicableSettlementHolds,
  getSettlementApprovalConflict,
} from "../src/lib/settlement-verification-policy.ts";

const reviewer = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherActor = "bbbbbbbbbbbbbbbbbbbbbbbb";
const payableId = "cccccccccccccccccccccccc";
const recoveryId = "dddddddddddddddddddddddd";

test("approval is blocked for the recording admin or an unknown actor", () => {
  assert.equal(getSettlementApprovalConflict(reviewer, [otherActor, reviewer.toUpperCase()]), "SELF_APPROVAL");
  assert.equal(getSettlementApprovalConflict(reviewer, [otherActor, null]), "ACTOR_UNKNOWN");
  assert.equal(getSettlementApprovalConflict(reviewer, ["invalid"]), "ACTOR_UNKNOWN");
  assert.equal(getSettlementApprovalConflict(reviewer, [otherActor]), null);
  assert.throws(() => getSettlementApprovalConflict("", [otherActor]), /Invalid reviewer ID/);
});

test("holds apply to the payable and recovery involved in an action", () => {
  const holds = [
    { id: "111111111111111111111111", subjectType: "PAYABLE", subjectId: payableId, status: "ACTIVE", reason: "INTEGRITY_MISMATCH" },
    { id: "222222222222222222222222", subjectType: "RECOVERY", subjectId: recoveryId, status: "ACTIVE", reason: "FINANCIAL_INVARIANT_FAILED" },
    { id: "333333333333333333333333", subjectType: "RECOVERY", subjectId: recoveryId, status: "RESOLVED", reason: "UNRESOLVED_AMOUNT_PROVENANCE" },
    { id: "444444444444444444444444", subjectType: "RECOVERY", subjectId: "eeeeeeeeeeeeeeeeeeeeeeee", status: "ACTIVE", reason: "INTEGRITY_MISMATCH" },
  ];
  assert.deepEqual(
    getApplicableSettlementHolds({ type: "PAYMENT", payableId }, holds).map((hold) => hold.id),
    ["111111111111111111111111"],
  );
  assert.deepEqual(
    getApplicableSettlementHolds({ type: "RECOVER", payableId, recoveryId }, holds).map((hold) => hold.id),
    ["111111111111111111111111", "222222222222222222222222"],
  );
  assert.throws(
    () => getApplicableSettlementHolds({ type: "RECOVER", payableId, recoveryId: "" }, holds),
    /Invalid recovery ID/,
  );
  assert.throws(
    () => getApplicableSettlementHolds({ type: "PAYMENT", payableId }, [{ ...holds[0], reason: "OTHER" }]),
    /Invalid financial hold/,
  );
});
