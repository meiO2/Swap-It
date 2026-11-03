
    import "server-only";
    import { Resend } from "resend";
    import type { OTPPurpose } from "@/models/OTP";

    export async function sendVerificationEmail(
    email: string,
    code: string,
    purpose: OTPPurpose = "REGISTER"
    ) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
        throw new Error(
        "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured."
        );
    }

    const isPasswordReset = purpose === "FORGOT_PASSWORD";

    const heading = isPasswordReset
        ? "Reset your SwapIt password"
        : "Welcome to SwapIt!";

    const description = isPasswordReset
        ? "We received a request to reset your SwapIt account password. Use the verification code below to continue."
        : "Use the verification code below to verify your email address.";

    const subject = isPasswordReset
        ? "Reset your SwapIt password"
        : "Verify your SwapIt account";

    const footer = isPasswordReset
        ? "If you didn't request a password reset, you can safely ignore this email."
        : "If you didn't create a SwapIt account, you can safely ignore this email.";

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        text: `${heading}\n\n${description}\n\n${code}\n\nThis code expires in 5 minutes. ${footer}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #292828;">
            <h2>${heading}</h2>
            <p>${description}</p>
            <div style="background: #F1EFEF; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
            <h1 style="letter-spacing: 8px; margin: 0;">${code}</h1>
            </div>
            <p>This code expires in 5 minutes.</p>
            <p style="color: #777; font-size: 13px;">${footer}</p>
        </div>
        `,
    });

    if (error) {
        console.error("Resend email error:", error);
        throw new Error("Failed to send email.");
    }

    return data;
    }
