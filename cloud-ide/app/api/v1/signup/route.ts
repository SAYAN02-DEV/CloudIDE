import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest){
    const data = await req.json();
    //save data to database

    console.log(data);
    return NextResponse.json({
        message: "You are signed up."
    });


}