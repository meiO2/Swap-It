import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import SellerFinancialResolution, { type SellerFinancialResolutionStatus } from "@/models/SellerFinancialResolution";

const STATUSES = new Set<string>(["PENDING", "ON_HOLD", "READY_FOR_REVIEW", "RESOLVED", "FAILED_REQUIRES_ATTENTION"]);

function isResolutionStatus(value: string): value is SellerFinancialResolutionStatus {
  return STATUSES.has(value);
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "25");
  const status = params.get("status");
  const search = params.get("search")?.trim() ?? "";
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) ||
    pageSize < 1 || pageSize > 100 || (status && !isResolutionStatus(status)) ||
    (search && !mongoose.isValidObjectId(search))) {
    return NextResponse.json({ success: false, message: "Invalid resolution filters or pagination." }, { status: 400 });
  }
  try {
    await connectDB();
    const filter = {
      ...(status && isResolutionStatus(status) ? { status } : {}),
      ...(search ? { $or: [{ _id: new mongoose.Types.ObjectId(search) }, { orderId: new mongoose.Types.ObjectId(search) }] } : {}),
    };
    const total = await SellerFinancialResolution.countDocuments(filter);
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = totalPages ? Math.min(page, totalPages) : 1;
    const items = await SellerFinancialResolution.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean();
    return NextResponse.json({ success: true, data: { items, pagination: { page: currentPage, pageSize, total, totalPages } } });
  } catch (error) {
    console.error("Seller financial resolution list error:", error);
    return NextResponse.json({ success: false, message: "Could not retrieve seller resolution jobs." }, { status: 500 });
  }
}
