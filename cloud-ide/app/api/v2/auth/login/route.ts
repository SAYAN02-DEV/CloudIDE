import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/db';
import { getUserByEmail, verifyPassword } from '@/db/queries';
import jwt from 'jsonwebtoken';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    const data = await req.json();
    
    if (!data.email || !data.password) {
      return NextResponse.json(
        { message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(data.email);

    if (!user) {
      return NextResponse.json(
        { message: 'Invalid Credentials' },
        { status: 401 }
      );
    }

    const isPasswordValid = await verifyPassword(data.password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { message: 'Invalid Credentials' },
        { status: 401 }
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        email: user.email,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    return NextResponse.json(
      {
        message: 'Login successful',
        token,
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error logging in:', error);
    return NextResponse.json(
      { message: 'Login failed' },
      { status: 500 }
    );
  }
}
