import mongoose, { Model, Schema } from "mongoose";

export interface IMockChatSummary {
  chatId: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  isActive: boolean;
}

const MockChatSummarySchema = new Schema<IMockChatSummary>(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    avatar: { type: String, required: true, trim: true },
    lastMessage: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    unread: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const MockChatSummary: Model<IMockChatSummary> =
  mongoose.models.MockChatSummary ||
  mongoose.model<IMockChatSummary>("MockChatSummary", MockChatSummarySchema);

export default MockChatSummary;
