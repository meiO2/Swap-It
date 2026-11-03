    import { cookies } from "next/headers";
    import { connectDB } from "@/lib/mongodb";
    import { hashSessionToken } from "@/lib/auth";
    import User from "@/models/User";
    import Session from "@/models/Session";

    export async function getCurrentUser() {
    await connectDB();

    // Read the session cookie from the incoming request.
    const cookieStore = await cookies();
    const token = cookieStore.get("swapit_session")?.value;

    if (!token) {
        return null;
    }

    // Hash the token before searching MongoDB.
    const tokenHash = hashSessionToken(token);

    // Find a session that has not expired.
    const session = await Session.findOne({
        tokenHash,
        expiresAt: { $gt: new Date() },
    });

    if (!session) {
        return null;
    }

    // Retrieve the associated user.
    const user = await User.findById(session.userId);

    if (!user || !user.isActive) {
        return null;
    }

    // Return only safe user information.
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
    };
    }