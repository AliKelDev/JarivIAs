import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { readOnboardingStatus } from "@/lib/onboarding/status";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const onboarding = await readOnboardingStatus(user.uid);
  if (!onboarding.isComplete) {
    redirect("/onboarding");
  }

  return (
    <DashboardClient
      user={{
        uid: user.uid,
        email: user.email,
        name: user.name,
      }}
    />
  );
}
