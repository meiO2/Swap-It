import mongoose, { Schema, type Model } from "mongoose";

export interface IQCAssessment {
  entityType: "order" | "listing";
  entityId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  category: string;
  answers: Array<{ criterionId: string; optionId: string }>;
  decision: "approve" | "reject";
  notes?: string;
}

const QCAssessmentSchema = new Schema<IQCAssessment>({
  entityType: { type: String, enum: ["order", "listing"], required: true },
  entityId: { type: Schema.Types.ObjectId, required: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, required: true, trim: true },
  answers: { type: [{ criterionId: String, optionId: String }], required: true },
  decision: { type: String, enum: ["approve", "reject"], required: true },
  notes: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true });

const QCAssessment: Model<IQCAssessment> = mongoose.models.QCAssessment || mongoose.model<IQCAssessment>("QCAssessment", QCAssessmentSchema);
export default QCAssessment;
