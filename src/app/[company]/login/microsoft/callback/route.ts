// "Continue with Microsoft", step 2: Microsoft sends the person back here with a code.
// Thin on purpose - the flow is src/server/microsoft-login.ts.
import { NextResponse, type NextRequest } from "next/server";
import { finishMicrosoftLogin } from "@/server/microsoft-login";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  const to = await finishMicrosoftLogin(company, request.nextUrl.origin, request.nextUrl.searchParams);
  return NextResponse.redirect(new URL(to, request.nextUrl.origin));
}
