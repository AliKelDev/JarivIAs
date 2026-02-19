import { getUserProfile } from "./profile";
import { getRecentMemoryEntries } from "./entries";
import type { UserProfile } from "./types";

function formatProfile(profile: UserProfile): string {
  const lines: string[] = [];

  if (profile.displayName) lines.push(`Name: ${profile.displayName}`);
  if (profile.role) lines.push(`Role: ${profile.role}`);
  if (profile.organization) lines.push(`Organization: ${profile.organization}`);
  if (profile.timezone) lines.push(`Timezone: ${profile.timezone}`);
  if (profile.preferredTone) lines.push(`Preferred tone: ${profile.preferredTone}`);

  if (profile.interests?.length) {
    lines.push(`Interests: ${profile.interests.join(", ")}`);
  }

  if (profile.ongoingProjects?.length) {
    lines.push(`Ongoing projects:`);
    for (const project of profile.ongoingProjects) {
      lines.push(`  - ${project}`);
    }
  }

  if (profile.importantContacts?.length) {
    lines.push(`Important contacts:`);
    for (const contact of profile.importantContacts) {
      const emailPart = contact.email ? ` (${contact.email})` : "";
      lines.push(`  - ${contact.name}${emailPart}: ${contact.relationship}`);
    }
  }

  if (profile.notes) {
    lines.push(`Notes: ${profile.notes}`);
  }

  return lines.join("\n");
}

export async function buildUserContextBlock(uid: string): Promise<string> {
  try {
    const [profile, memoryEntries] = await Promise.all([
      getUserProfile(uid),
      getRecentMemoryEntries(uid, 20),
    ]);

    const sections: string[] = [];

    if (profile) {
      const profileText = formatProfile(profile);
      if (profileText) sections.push(profileText);
    }

    if (memoryEntries.length > 0) {
      const memoryLines = memoryEntries.map((e) => `  - ${e.content}`).join("\n");
      sections.push(`Things to remember:\n${memoryLines}`);
    }

    if (sections.length === 0) return "";

    return `[ABOUT THE USER]\n${sections.join("\n")}\n[END ABOUT THE USER]`;
  } catch {
    // Never let memory failures break the agent run.
    return "";
  }
}
