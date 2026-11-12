import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import QCAssessment from "@/models/QCAssessment";
import { buildTimeline } from "@/lib/orders";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID." },
        { status: 400 },
      );
    }
    await connectDB();
    const userId = new mongoose.Types.ObjectId(auth.user.id);
    const order = await Order.findOne({
      _id: id,
      $or: [{ buyerId: userId }, { "items.sellerId": userId }],
    }).lean();
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 },
      );
    }

    const assessments = await QCAssessment.find({
      entityType: "order",
      entityId: order._id,
    }).lean();
    const assessmentMap = new Map(
      assessments.map((assessment) => [
        assessment.productId.toString(),
        assessment,
      ]),
    );
    const isBuyer = order.buyerId.toString() === auth.user.id;
    const item = order.items[0];
    const timelineIndex =
      ["DELIVERED", "COMPLETED"].includes(order.status) ? 5 :
      order.status === "SHIPPED" ? 3 :
      order.status === "PROCESSING" ? 2 :
      ["RECEIVED", "QC_IN_PROGRESS", "AWAITING_BUYER_CONFIRMATION"].includes(order.status) ||
        item?.qcStatus === "PENDING" ? 1 : 0;
    const timeline = buildTimeline(
      "courier",
      order.createdAt?.toISOString() ?? new Date().toISOString(),
      timelineIndex,
    );
    if (item?.handover?.receivedAt && timeline[1]) {
      timeline[1] = {
        ...timeline[1],
        at: item.handover.receivedAt.toISOString(),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        sellerFeeSnapshots: undefined,
        sellerFeeSnapshot: isBuyer
          ? undefined
          : order.sellerFeeSnapshots?.find(
              (snapshot) => snapshot.sellerId.toString() === auth.user.id,
            ),
        id: order._id.toString(),
        timeline,
        progress: timelineIndex / 5,
        deliveryMethod: order.deliveryMethod,
        delivery: {
          method: order.deliveryMethod,
          address: order.shippingAddress
            ? {
                id: "order-address",
                name: order.shippingAddress.name,
                phone: order.shippingAddress.phone,
                address: order.shippingAddress.address,
                city: order.shippingAddress.city,
                postalCode: order.shippingAddress.postalCode,
              }
            : undefined,
          courier: order.courierCode
            ? {
                id: order.courierCode,
                name: order.courierName ?? order.courierCode,
                fee: order.shippingFee,
                minDays: 1,
                maxDays: 7,
              }
            : undefined,
        },
        shippingAddress: order.shippingAddress,
        courierCode: order.courierCode,
        courierName: order.courierName,
        courierService: order.courierService,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        items: order.items.map((item) => ({
          ...item,
          productId: item.productId.toString(),
          sellerId: item.sellerId.toString(),
          ...(isBuyer && assessmentMap.has(item.productId.toString())
            ? {
                qcAssessment: {
                  category: assessmentMap.get(item.productId.toString())?.category,
                  answers: assessmentMap.get(item.productId.toString())?.answers,
                  decision: assessmentMap.get(item.productId.toString())?.decision,
                  notes: assessmentMap.get(item.productId.toString())?.notes,
                  evidenceUrls:
                    assessmentMap.get(item.productId.toString())?.evidenceUrls ?? [],
                },
              }
            : {}),
        })),
      },
    });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve order." },
      { status: 500 },
    );
  }
}
