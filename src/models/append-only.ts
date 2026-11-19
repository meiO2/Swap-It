import type { Schema } from "mongoose";

export function enforceAppendOnly(schema: Schema, name: string) {
  function rejectMutation(): never {
    throw new Error(`${name} is append-only.`);
  }

  schema.pre("save", function () {
    if (!this.isNew) rejectMutation();
  });
  schema.pre(
    [
      "updateOne",
      "updateMany",
      "replaceOne",
      "findOneAndUpdate",
      "findOneAndReplace",
      "findOneAndDelete",
      "deleteOne",
      "deleteMany",
    ],
    rejectMutation,
  );
  schema.pre("deleteOne", { document: true, query: false }, rejectMutation);
  schema.pre("bulkWrite", function (operations) {
    if (operations.some((operation) =>
      !("insertOne" in operation) || Object.keys(operation).length !== 1
    )) {
      rejectMutation();
    }
  });
}
