
    import mongoose, { Schema, Model, Types } from "mongoose";

    export interface IMessage {
    conversationId: Types.ObjectId;
    senderId: Types.ObjectId;
    text: string;
    readAt?: Date;
    }

    const MessageSchema = new Schema<IMessage>(
    {
        conversationId: {
        type: Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,
        index: true,
        },

        senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        },

        text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
        },

        readAt: {
        type: Date,
        default: null,
        },
    },
    {
        timestamps: true,
    }
    );

    // Retrieve messages in chronological order.
    MessageSchema.index({
    conversationId: 1,
    createdAt: 1,
    });

    const Message: Model<IMessage> =
    mongoose.models.Message ||
    mongoose.model<IMessage>("Message", MessageSchema);

    export default Message;
