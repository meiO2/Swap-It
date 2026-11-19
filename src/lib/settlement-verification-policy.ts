export type SettlementHoldReason =
  | "INTEGRITY_MISMATCH"
  | "FINANCIAL_INVARIANT_FAILED"
  | "UNRESOLVED_AMOUNT_PROVENANCE";

export type SettlementHold = {
  id: string;
  subjectType: "PAYABLE" | "RECOVERY";
  subjectId: string;
  status: "ACTIVE" | "RESOLVED";
  reason: SettlementHoldReason;
};

export type SettlementAction =
  | { type: "PAYMENT" | "OVERPAYMENT_RETURN"; payableId: string }
  | { type: "RECOVER"; payableId: string; recoveryId: string };

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export function getSettlementApprovalConflict(
  reviewerId: string,
  recordedBy: ReadonlyArray<string | null | undefined>,
): "SELF_APPROVAL" | "ACTOR_UNKNOWN" | null {
  if (!isObjectId(reviewerId)) throw new Error("Invalid reviewer ID.");

  if (recordedBy.some((actor) => !isObjectId(actor))) return "ACTOR_UNKNOWN";
  if (recordedBy.some((actor) => actor?.toLowerCase() === reviewerId.toLowerCase())) {
    return "SELF_APPROVAL";
  }
  return null;
}

export function getApplicableSettlementHolds(
  action: SettlementAction,
  holds: ReadonlyArray<SettlementHold>,
): SettlementHold[] {
  if (!isObjectId(action.payableId)) throw new Error("Invalid payable ID.");
  if (action.type === "RECOVER" && !isObjectId(action.recoveryId)) {
    throw new Error("Invalid recovery ID.");
  }
  if (!["PAYMENT", "OVERPAYMENT_RETURN", "RECOVER"].includes(action.type)) {
    throw new Error("Invalid settlement action.");
  }

  return holds.filter((hold) => {
    if (
      !isObjectId(hold.id) ||
      !isObjectId(hold.subjectId) ||
      !["PAYABLE", "RECOVERY"].includes(hold.subjectType) ||
      !["ACTIVE", "RESOLVED"].includes(hold.status) ||
      !["INTEGRITY_MISMATCH", "FINANCIAL_INVARIANT_FAILED", "UNRESOLVED_AMOUNT_PROVENANCE"].includes(hold.reason)
    ) {
      throw new Error("Invalid financial hold.");
    }

    if (hold.status !== "ACTIVE") return false;
    if (hold.subjectType === "PAYABLE") {
      return hold.subjectId.toLowerCase() === action.payableId.toLowerCase();
    }
    return action.type === "RECOVER" &&
      hold.subjectId.toLowerCase() === action.recoveryId.toLowerCase();
  });
}
