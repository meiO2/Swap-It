import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import RevampOffer from "@/models/RevampOffer";
import { createNotification } from "@/lib/notifications";

const OFFER_DAYS = 14;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  try {
    await connectDB();
    const now = new Date(); const eligibleBefore = new Date(now); eligibleBefore.setDate(eligibleBefore.getDate() - 90);
    const expiredOffers = await RevampOffer.find({ status: "PENDING", expiresAt: { $lte: now } }).select("productId");
    for (const offer of expiredOffers) {
      const expired = await RevampOffer.updateOne({ _id: offer._id, status: "PENDING" }, { $set: { status: "EXPIRED", decidedAt: now } });
      if (expired.modifiedCount) await Product.updateOne({ _id: offer.productId, status: "REVAMP_ELIGIBLE" }, { $set: { status: "AVAILABLE" } });
    }
    const products = await Product.find({ status: "AVAILABLE", publishedAt: { $ne: null, $lte: eligibleBefore } }).select("sellerId price name").lean();
    let created = 0;
    for (const product of products) {
      const offerAmount = Math.floor(product.price * 0.8); const expiresAt = new Date(now); expiresAt.setDate(expiresAt.getDate() + OFFER_DAYS);
      try {
        const offer = await RevampOffer.create({ productId: product._id, sellerId: product.sellerId, originalPrice: product.price, offerAmount, expiresAt });
        const locked = await Product.updateOne({ _id: product._id, status: "AVAILABLE" }, { $set: { status: "REVAMP_ELIGIBLE" } });
        if (!locked.modifiedCount) { await RevampOffer.deleteOne({ _id: offer._id }); continue; }
        await createNotification({ recipientId: product.sellerId.toString(), type: "REVAMP_UPDATE", title: "Revamp! offer available", message: `Your listing “${product.name}” is eligible for a ${offerAmount.toLocaleString("id-ID")} GP Revamp offer.`, link: "/revamp/offers" });
        created++;
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate key/i.test(error.message)) throw error;
      }
    }
    return NextResponse.json({ success: true, created, expired: expiredOffers.length, checked: products.length, eligibleBefore: eligibleBefore.toISOString() });
  } catch (error) { console.error("Revamp eligibility cron error:", error); return NextResponse.json({ success: false, message: "Could not process Revamp eligibility." }, { status: 500 }); }
}
