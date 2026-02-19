import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { readOnboardingStatus } from "@/lib/onboarding/status";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const status = await readOnboardingStatus(user.uid);
  if (status.isComplete) {
    redirect("/dashboard");
  }

  return (
    <OnboardingClient
      user={{
        uid: user.uid,
        email: user.email ?? null,
        name: user.name ?? null,
      }}
      initialStatus={status}
    />
  );
}
