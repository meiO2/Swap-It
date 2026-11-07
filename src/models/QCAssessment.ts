
import mongoose, { Schema, type Model } from "mongoose";

export interface IQCAssessment {
  entityType: "order";

  // Order ID. An order may contain multiple products.
  entityId: mongoose.Types.ObjectId;

  // Identifies the specific product within the order.
  productId: mongoose.Types.ObjectId;

  reviewerId: mongoose.Types.ObjectId;

  category: string;

  answers: Array<{
    criterionId: string;
    optionId: string;
  }>;

  decision: "approve" | "reject";

  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

const QCAssessmentSchema = new Schema<IQCAssessment>(
  {
    entityType: {
      type: String,
      enum: ["order"],
      required: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Order",
      index: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    answers: {
      type: [
        {
          criterionId: {
            type: String,
            required: true,
          },
          optionId: {
            type: String,
            required: true,
          },
        },
      ],
      required: true,
    },

    decision: {
      type: String,
      enum: ["approve", "reject"],
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  },
);

QCAssessmentSchema.index(
  { entityId: 1, productId: 1 },
  { unique: true },
);

const QCAssessment: Model<IQCAssessment> =
  mongoose.models.QCAssessment ||
  mongoose.model<IQCAssessment>(
    "QCAssessment",
    QCAssessmentSchema,
  );

export default QCAssessment;
