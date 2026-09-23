// "Continue with Microsoft", step 1: off to the company's Microsoft sign-in.
// Thin on purpose - the flow is src/server/microsoft-login.ts.
import { NextResponse, type NextRequest } from "next/server";
import { startMicrosoftLogin } from "@/server/microsoft-login";

type Ctx = { params: Promise<{ company: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { company } = await params;
  const to = await startMicrosoftLogin(company, request.nextUrl.origin, request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(to, request.nextUrl.origin));
}
