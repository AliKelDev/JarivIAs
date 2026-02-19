import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { readOnboardingStatus } from "@/lib/onboarding/status";
import { LoginClient } from "./login-client";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    const onboarding = await readOnboardingStatus(user.uid);
    redirect(onboarding.isComplete ? "/dashboard" : "/onboarding");
  }

  return <LoginClient />;
}
