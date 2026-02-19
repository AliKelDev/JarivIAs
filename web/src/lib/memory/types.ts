export type ImportantContact = {
  name: string;
  email?: string;
  relationship: string;
};

export type UserProfile = {
  displayName?: string;
  role?: string;
  organization?: string;
  timezone?: string;
  language?: string;
  preferredTone?: "formal" | "casual" | "concise";
  interests?: string[];
  ongoingProjects?: string[];
  importantContacts?: ImportantContact[];
  notes?: string;
};

export type MemoryEntrySource = "conversation" | "action" | "system" | "explicit";

export type MemoryEntry = {
  id: string;
  source: MemoryEntrySource;
  threadId?: string;
  content: string;
  tags?: string[];
  confidence: "high" | "medium";
};
