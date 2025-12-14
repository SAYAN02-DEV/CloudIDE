import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/db";
import { getUserByUsername, verifyPassword } from "@/db/queries";

export async function POST(req: NextRequest) {
    try {
        // Connect to database
        await connectDB();
        
        const data = await req.json();
        
        // Validate input
        if (!data.username || !data.password) {
            return NextResponse.json(
                { message: "Username and password are required" },
                { status: 400 }
            );
        }

        // Get user from database
        const user = await getUserByUsername(data.username);

        if (!user) {
            return NextResponse.json(
                { message: "Invalid Credentials" },
                { status: 401 }
            );
        }

        // Verify password with bcrypt
        const isPasswordValid = await verifyPassword(data.password, user.password);
        
        if (isPasswordValid) {
            return NextResponse.json(
                { 
                    message: "You are signed in",
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email
                    }
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            { message: "Invalid Credentials" },
            { status: 401 }
        );
    } catch (error) {
        console.error("Signin error:", error);
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 }
        );
    }
}