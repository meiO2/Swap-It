
    import mongoose, { Schema, Model, Types } from "mongoose";

    export interface IConversation {
    participants: Types.ObjectId[];
    participantKey: string;
    lastMessage?: string;
    lastMessageAt?: Date;
    }

    const ConversationSchema = new Schema<IConversation>(
    {
        participants: {
        type: [Schema.Types.ObjectId],
        ref: "User",
        required: true,
        validate: {
            validator: (value: Types.ObjectId[]) => value.length === 2,
            message: "A conversation must have exactly two participants.",
        },
        },

        // Sorted participant IDs, used to prevent duplicate conversations.
        participantKey: {
        type: String,
        required: true,
        unique: true,
        },

        lastMessage: {
        type: String,
        default: "",
        },

        lastMessageAt: {
        type: Date,
        },
    },
    {
        timestamps: true,
    }
    );

    ConversationSchema.index({ participants: 1, lastMessageAt: -1 });

    const Conversation: Model<IConversation> =
    mongoose.models.Conversation ||
    mongoose.model<IConversation>("Conversation", ConversationSchema);

    export default Conversation;
