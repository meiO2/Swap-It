import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { awardGreenPoints } from "@/lib/green-points";
import { createNotification } from "@/lib/notifications";
import Product from "@/models/Product";
import RevampOffer from "@/models/RevampOffer";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(); if (!auth.success) return auth.response;
  try {
    const { id } = await params; const body = await request.json(); if (!mongoose.isValidObjectId(id) || !["ACCEPT", "REJECT"].includes(body?.decision)) return NextResponse.json({ success: false, message: "Choose accept or reject." }, { status: 400 });
    await connectDB(); const offer = await RevampOffer.findOne({ _id: id, sellerId: auth.user.id });
    if (!offer) return NextResponse.json({ success: false, message: "Revamp offer not found." }, { status: 404 });
    if (offer.status !== "PENDING") return NextResponse.json({ success: false, message: "This offer has already been decided." }, { status: 409 });
    if (offer.expiresAt <= new Date()) { offer.status = "EXPIRED"; offer.decidedAt = new Date(); await offer.save(); await Product.updateOne({ _id: offer.productId, status: "REVAMP_ELIGIBLE" }, { $set: { status: "AVAILABLE" } }); return NextResponse.json({ success: false, message: "This offer has expired." }, { status: 409 }); }
    const accepted = body.decision === "ACCEPT"; offer.status = accepted ? "ACCEPTED" : "REJECTED"; offer.decidedAt = new Date(); await offer.save();
    await Product.updateOne({ _id: offer.productId, sellerId: auth.user.id, status: "REVAMP_ELIGIBLE" }, { $set: { status: accepted ? "REVAMPED" : "AVAILABLE" } });
    if (accepted) await awardGreenPoints({ userId: auth.user.id, amount: offer.offerAmount, description: "80% Revamp offer accepted", referenceKey: `revamp-offer:${offer._id}:compensation` });
    await createNotification({ recipientId: auth.user.id, type: "REVAMP_UPDATE", title: accepted ? "Revamp offer accepted" : "Revamp offer declined", message: accepted ? `${offer.offerAmount.toLocaleString("id-ID")} GP has been added to your wallet.` : "Your listing is available in the marketplace again.", link: accepted ? "/wallet" : "/listings" });
    return NextResponse.json({ success: true, data: offer });
  } catch (error) { console.error("Decide Revamp offer error:", error); return NextResponse.json({ success: false, message: "Could not update Revamp offer." }, { status: 500 }); }
}
