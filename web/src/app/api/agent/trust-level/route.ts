import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import {
  AGENT_TRUST_LEVELS,
  isAgentTrustLevel,
  readAgentTrustLevel,
  setAgentTrustLevel,
} from "@/lib/agent/trust";

export const runtime = "nodejs";

type SetTrustLevelBody = {
  trustLevel?: unknown;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trust = await readAgentTrustLevel(user.uid);

  return NextResponse.json({
    ok: true,
    trustLevel: trust.trustLevel,
    source: trust.source,
    availableTrustLevels: AGENT_TRUST_LEVELS,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SetTrustLevelBody | null;
  const trustLevel = body?.trustLevel;

  if (!isAgentTrustLevel(trustLevel)) {
    return NextResponse.json(
      {
        error: "Invalid trustLevel. Expected supervised, delegated, or autonomous.",
      },
      { status: 400 },
    );
  }

  await setAgentTrustLevel({ uid: user.uid, trustLevel });

  return NextResponse.json({
    ok: true,
    trustLevel,
    availableTrustLevels: AGENT_TRUST_LEVELS,
  });
}

