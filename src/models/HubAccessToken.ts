
    import mongoose, { Model, Schema } from "mongoose";

    export type HubAccessActivity =
    | "DONATION"
    | "SELLER_HANDOVER";

    export type HubAccessTokenStatus =
    | "ACTIVE"
    | "CONSUMED"
    | "REVOKED";

    export interface IHubAccessToken {
    tokenHash: string;

    activity: HubAccessActivity;

    userId: mongoose.Types.ObjectId;
    hubId: string;

    // Donation reference
    donationSessionId?: string;

    // Seller handover reference
    orderId?: mongoose.Types.ObjectId;
    productId?: mongoose.Types.ObjectId;

    status: HubAccessTokenStatus;

    expiresAt: Date;
    consumedAt?: Date;
    consumedByDeviceId?: string;

    createdAt?: Date;
    updatedAt?: Date;
    }

    const HubAccessTokenSchema = new Schema<IHubAccessToken>(
    {
        tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
        },

        activity: {
        type: String,
        enum: ["DONATION", "SELLER_HANDOVER"],
        required: true,
        },

        userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
        },

        hubId: {
        type: String,
        required: true,
        trim: true,
        index: true,
        },

        donationSessionId: {
        type: String,
        trim: true,
        },

        orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        },

        productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        },

        status: {
        type: String,
        enum: ["ACTIVE", "CONSUMED", "REVOKED"],
        default: "ACTIVE",
        required: true,
        index: true,
        },

        expiresAt: {
        type: Date,
        required: true,
        index: true,
        },

        consumedAt: {
        type: Date,
        },

        consumedByDeviceId: {
        type: String,
        trim: true,
        },
    },
    {
        timestamps: true,
    },
    );

    // Ensure donation tokens have donation references,
    // and seller handover tokens have order/product references.
    HubAccessTokenSchema.pre("validate", function () {
    if (
        this.activity === "DONATION" &&
        (!this.donationSessionId || this.orderId || this.productId)
    ) {
        this.invalidate(
        "donationSessionId",
        "Donation tokens require a donation session only.",
        );
    }

    if (
        this.activity === "SELLER_HANDOVER" &&
        (!this.orderId || !this.productId || this.donationSessionId)
    ) {
        this.invalidate(
        "orderId",
        "Seller handover tokens require an order and product reference only.",
        );
    }
    });

    // Keep token history for auditing.
    // Expired records will be rejected by application logic,
    // rather than automatically deleted by MongoDB.

    HubAccessTokenSchema.index({
    userId: 1,
    activity: 1,
    status: 1,
    });

    const HubAccessToken: Model<IHubAccessToken> =
    mongoose.models.HubAccessToken ||
    mongoose.model<IHubAccessToken>(
        "HubAccessToken",
        HubAccessTokenSchema,
    );

    export default HubAccessToken;
