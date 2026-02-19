import type { AgentTrustLevel, AgentTrustLevelSource } from "@/lib/agent/trust";
import { readAgentTrustLevel } from "@/lib/agent/trust";
import { getGoogleIntegration } from "@/lib/google/integration";
import { getUserProfile } from "@/lib/memory";
import type { UserProfile } from "@/lib/memory/types";

export type OnboardingStatus = {
  googleConnected: boolean;
  googleAccountEmail: string | null;
  profileComplete: boolean;
  trustConfigured: boolean;
  trustLevel: AgentTrustLevel;
  trustSource: AgentTrustLevelSource;
  isComplete: boolean;
  profile: UserProfile;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function readOnboardingStatus(uid: string): Promise<OnboardingStatus> {
  const [integration, profile, trust] = await Promise.all([
    getGoogleIntegration(uid),
    getUserProfile(uid),
    readAgentTrustLevel(uid),
  ]);

  const googleConnected = Boolean(integration?.connected);
  const profileData = profile ?? {};
  const profileComplete = hasText(profileData.displayName);
  const trustConfigured = trust.source !== "default";
  const isComplete = googleConnected && profileComplete && trustConfigured;

  return {
    googleConnected,
    googleAccountEmail: integration?.accountEmail ?? null,
    profileComplete,
    trustConfigured,
    trustLevel: trust.trustLevel,
    trustSource: trust.source,
    isComplete,
    profile: profileData,
  };
}
