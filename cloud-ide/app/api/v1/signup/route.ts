import { NextRequest, NextResponse } from "next/server";
import { connectDB } from '@/db';
import { createUser, getUserByEmail, getUserByUsername } from '@/db/queries';

export async function POST(req: NextRequest){
    try {
        await connectDB();
        
        const data = await req.json();
        
        if (!data.username || !data.email || !data.password) {
            return NextResponse.json(
                { message: 'Username, email, and password are required' },
                { status: 400 }
            );
        }

        // Check if user already exists
        const existingUserByEmail = await getUserByEmail(data.email);
        if (existingUserByEmail) {
            return NextResponse.json(
                { message: 'Email already exists' },
                { status: 400 }
            );
        }

        const existingUserByUsername = await getUserByUsername(data.username);
        if (existingUserByUsername) {
            return NextResponse.json(
                { message: 'Username already exists' },
                { status: 400 }
            );
        }

        // Create new user
        const user = await createUser(data.username, data.email, data.password);

        console.log('User created:', { username: user.username, email: user.email });

        return NextResponse.json({
            message: "You are signed up.",
            user: {
                id: user._id.toString(),
                username: user.username,
                email: user.email,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Error signing up:', error);
        return NextResponse.json(
            { message: 'Signup failed' },
            { status: 500 }
        );
    }
}