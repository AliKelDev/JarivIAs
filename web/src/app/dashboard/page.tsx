import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
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
