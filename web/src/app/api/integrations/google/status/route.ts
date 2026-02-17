import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getGoogleIntegration } from "@/lib/google/integration";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await getGoogleIntegration(user.uid);
  if (!integration?.connected) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    accountEmail: integration.accountEmail,
    scopes: integration.scopes,
    updatedAt: integration.updatedAt?.toDate().toISOString() ?? null,
  });
}
