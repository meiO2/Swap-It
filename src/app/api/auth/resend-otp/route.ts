import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import PendingRegistration from "@/models/PendingRegistration";
import { createOTP } from "@/lib/auth/otp-service";
import { sendVerificationEmail } from "@/lib/email/send-verification-email";

type OTPPurpose = "REGISTER" | "FORGOT_PASSWORD";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Provide a valid email and purpose." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
    }
    if (input.purpose !== "REGISTER" && input.purpose !== "FORGOT_PASSWORD") {
      return NextResponse.json({ success: false, message: "Choose a valid verification purpose." }, { status: 400 });
    }
    const email = input.email.trim().toLowerCase();
    const purpose = input.purpose as OTPPurpose;
    await connectDB();

    if (purpose === "REGISTER") {
      const pending = await PendingRegistration.findOne({ email, expiresAt: { $gt: new Date() } });
      if (!pending) {
        return NextResponse.json({ success: false, message: "Registration request not found or expired. Please register again." }, { status: 404 });
      }
    } else {
      const user = await User.findOne({ email, isActive: true, emailVerifiedAt: { $ne: null } });
      if (!user) {
        return NextResponse.json({ success: true, message: "If an eligible account exists, a password reset code has been sent." });
      }
    }
    const code = await createOTP(email, purpose);
    await sendVerificationEmail(email, code, purpose);
    return NextResponse.json({ success: true, message: "A new verification code has been sent." });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return NextResponse.json({ success: false, message: "Could not resend the verification code." }, { status: 500 });
  }
}
