import mongoose, { Schema, type Model } from "mongoose";

export interface INews {
  title: string;
  date: string;
  description: string;
  clothesDistributed: number;
  image: string;
  status: "draft" | "published";
  authorId: mongoose.Types.ObjectId;
}

const NewsSchema = new Schema<INews>({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  date: { type: String, required: true },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  clothesDistributed: { type: Number, required: true, min: 0 },
  image: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const News: Model<INews> = mongoose.models.News || mongoose.model<INews>("News", NewsSchema);
export default News;
