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
        emailVerifiedAt: Date | null;
        addresses: IUserAddress[];
    }

    export interface IUserAddress {
        id: string;
        name: string;
        phone: string;
        address: string;
        city: string;
        postalCode: string;
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

        emailVerifiedAt: {
        type: Date,
        default: null,
        },

        addresses: [{
            id: { type: String, required: true },
            name: { type: String, required: true, trim: true, maxlength: 100 },
            phone: { type: String, required: true, trim: true, maxlength: 30 },
            address: { type: String, required: true, trim: true, maxlength: 300 },
            city: { type: String, required: true, trim: true, maxlength: 100 },
            postalCode: { type: String, required: true, trim: true, maxlength: 20 },
        }],
    },
    {
        timestamps: true,
    }
    );

    const User: Model<IUser> =
    mongoose.models.User ||
    mongoose.model<IUser>("User", UserSchema);

    export default User;