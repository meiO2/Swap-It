
    import "server-only";
    import { Resend } from "resend";

    export async function sendVerificationEmail(
    email: string,
    code: string
    ) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
        throw new Error(
        "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured."
        );
    }

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Verify your SwapIt account",
        text: `Your SwapIt verification code is ${code}. It expires in 5 minutes.`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
            <h2>Welcome to SwapIt!</h2>
            <p>Use the verification code below to verify your email address.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 0;">
            ${code}
            </div>
            <p>This code expires in 5 minutes.</p>
            <p>If you didn't request this code, you can safely ignore this email.</p>
            <p>Swap More, Waste Less.</p>
        </div>
        `,
    });

    if (error) {
        console.error("Resend email error:", error);
        throw new Error("Failed to send verification email.");
    }

    return data;
    }
