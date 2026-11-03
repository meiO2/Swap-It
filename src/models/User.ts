    import mongoose, { Schema, Model } from "mongoose";

    export type UserRole = "CUSTOMER" | "ADMIN" | "INSPECTOR";

    export interface IUser {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    phone?: string;
    avatarUrl?: string;
    isActive: boolean;
    }

    const UserSchema = new Schema<IUser>(
    {
        name: {
        type: String,
        required: true,
        trim: true,
        },

        email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        },

        passwordHash: {
        type: String,
        required: true,
        select: false,
        },

        role: {
        type: String,
        enum: ["CUSTOMER", "ADMIN", "INSPECTOR"],
        default: "CUSTOMER",
        required: true,
        },

        phone: {
        type: String,
        trim: true,
        },

        avatarUrl: {
        type: String,
        trim: true,
        },

        isActive: {
        type: Boolean,
        default: true,
        },
    },
    {
        timestamps: true,
    }
    );

    const User: Model<IUser> =
    mongoose.models.User ||
    mongoose.model<IUser>("User", UserSchema);

    export default User;