import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { readOnboardingStatus } from "@/lib/onboarding/status";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/landing");
  }

  const onboarding = await readOnboardingStatus(user.uid);
  redirect(onboarding.isComplete ? "/dashboard" : "/onboarding");
}
