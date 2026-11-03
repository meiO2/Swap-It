    import { NextResponse } from "next/server";
    import { getCurrentUser } from "@/lib/session";
    import type { UserRole } from "@/models/User";

    type CurrentUser = NonNullable<
    Awaited<ReturnType<typeof getCurrentUser>>
    >;

    type AuthResult =
    | {
        success: true;
        user: CurrentUser;
        }
    | {
        success: false;
        response: NextResponse;
        };

    // Check whether a user is logged in.
    export async function requireAuth(): Promise<AuthResult> {
    const user = await getCurrentUser();

    if (!user) {
        return {
        success: false,
        response: NextResponse.json(
            {
            success: false,
            message: "Unauthorized. Please log in.",
            },
            { status: 401 }
        ),
        };
    }

    return {
        success: true,
        user,
    };
    }

    // Check whether a logged-in user has the required role.
    export async function requireRole(
    allowedRoles: UserRole[]
    ): Promise<AuthResult> {
    const auth = await requireAuth();

    if (!auth.success) {
        return auth;
    }

    if (!allowedRoles.includes(auth.user.role)) {
        return {
        success: false,
        response: NextResponse.json(
            {
            success: false,
            message: "Forbidden. You do not have permission.",
            },
            { status: 403 }
        ),
        };
    }

    return auth;
    }