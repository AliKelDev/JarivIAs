import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginClient } from "./login-client";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }

  return <LoginClient />;
}
