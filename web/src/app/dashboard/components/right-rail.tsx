"use client";

import { useState } from "react";
import type {
    AttachedContextItem,
    RecentInboxDigestItem,
    UpcomingCalendarDigestItem,
} from "../types";
import styles from "../dashboard.module.css";

interface DraftItem {
    id: string;
    messageId?: string | null;
    subject: string;
    to: string;
    snippet?: string;
    updatedAtIso: string | null;
}

interface RightRailProps {
    integrationConnected: boolean;
    workspaceLoading: boolean;
    upcomingEvents: UpcomingCalendarDigestItem[];
    recentInboxMessages: RecentInboxDigestItem[];
    recentDrafts: DraftItem[];
    pinnedContext: AttachedContextItem[];
    activeToolNames: string[];
    onPin: (item: AttachedContextItem) => void;
    onUnpin: (id: string) => void;
    onSendDraft: (draftId: string) => Promise<void>;
    formatDateTime: (iso: string) => string;
    truncateWithEllipsis: (text: string, maxLength: number) => string;
}

export function RightRail({
    integrationConnected,
    workspaceLoading,
    upcomingEvents,
    recentInboxMessages,
    recentDrafts,
    pinnedContext,
    activeToolNames,
    onPin,
    onUnpin,
    onSendDraft,
    formatDateTime,
    truncateWithEllipsis,
}: RightRailProps) {
    const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null);
    const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);

    const isPinned = (id: string) => pinnedContext.some((c) => c.id === id);

    async function handleSendDraft(draftId: string) {
        if (sendingDraftId) return;
        if (confirmingDraftId !== draftId) {
            setConfirmingDraftId(draftId);
            return;
        }
        setSendingDraftId(draftId);
        setConfirmingDraftId(null);
        try {
            await onSendDraft(draftId);
        } finally {
            setSendingDraftId(null);
        }
    }

    const calendarActive = activeToolNames.some((t) =>
        ["calendar_upcoming", "calendar_create"].includes(t)
    );
    const inboxActive = activeToolNames.some((t) =>
        ["gmail_search", "gmail_recent", "gmail_reply", "gmail_send"].includes(t)
    );

    return (
        <>
            {/* Calendar section */}
            <div className={calendarActive ? `${styles.railSection} ${styles.railSectionHighlighted}` : styles.railSection}>
                <p className={styles.railSectionTitle}>Today&apos;s Calendar</p>
                {workspaceLoading ? (
                    <p className={styles.railEmpty}>Loading...</p>
                ) : !integrationConnected ? (
                    <p className={styles.railEmpty}>Connect Google to see events.</p>
                ) : upcomingEvents.length === 0 ? (
                    <p className={styles.railEmpty}>No upcoming events.</p>
                ) : (
                    <ul className={styles.railList}>
                        {upcomingEvents.slice(0, 6).map((event) => {
                            const id = event.id ?? `event-${event.startIso}`;
                            const pinned = isPinned(id);
                            return (
                                <li key={id} className={styles.railItem}>
                                    <div className={styles.railItemHead}>
                                        <div className={styles.railItemContent}>
                                            {event.startIso ? (
                                                <span className={styles.railItemTime}>
                                                    {formatDateTime(event.startIso).replace(/,.*$/, "").trim()}
                                                </span>
                                            ) : null}
                                            {event.htmlLink ? (
                                                <a
                                                    href={event.htmlLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={styles.railItemTitleLink}
                                                >
                                                    {truncateWithEllipsis(event.summary, 40)}
                                                </a>
                                            ) : (
                                                <span className={styles.railItemTitle}>
                                                    {truncateWithEllipsis(event.summary, 40)}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className={pinned ? styles.railPinButtonActive : styles.railPinButton}
                                            onClick={() =>
                                                pinned
                                                    ? onUnpin(id)
                                                    : onPin({
                                                        type: "calendar_event",
                                                        id,
                                                        title: event.summary,
                                                        snippet: event.description ?? undefined,
                                                        meta: {
                                                            startIso: event.startIso,
                                                            endIso: event.endIso,
                                                            location: event.location,
                                                        },
                                                    })
                                            }
                                        >
                                            {pinned ? "✕" : "+ pin"}
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Inbox section */}
            <div className={inboxActive ? `${styles.railSection} ${styles.railSectionHighlighted}` : styles.railSection}>
                <p className={styles.railSectionTitle}>Inbox</p>
                {workspaceLoading ? (
                    <p className={styles.railEmpty}>Loading...</p>
                ) : !integrationConnected ? (
                    <p className={styles.railEmpty}>Connect Google to see inbox.</p>
                ) : recentInboxMessages.length === 0 ? (
                    <p className={styles.railEmpty}>No recent messages.</p>
                ) : (
                    <ul className={styles.railList}>
                        {recentInboxMessages.slice(0, 6).map((message) => {
                            const pinned = isPinned(message.id);
                            return (
                                <li key={message.id} className={styles.railItem}>
                                    <div className={styles.railItemHead}>
                                        <div className={styles.railItemContent}>
                                            <span className={styles.railItemTitle}>
                                                {truncateWithEllipsis(message.from.replace(/<.*>/, "").trim() || message.from, 28)}
                                            </span>
                                            <span className={styles.railItemSubtitle}>
                                                {truncateWithEllipsis(message.subject, 36)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={pinned ? styles.railPinButtonActive : styles.railPinButton}
                                            onClick={() =>
                                                pinned
                                                    ? onUnpin(message.id)
                                                    : onPin({
                                                        type: "email",
                                                        id: message.id,
                                                        title: message.subject,
                                                        snippet: message.snippet,
                                                        meta: { from: message.from },
                                                    })
                                            }
                                        >
                                            {pinned ? "✕" : "+ pin"}
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Drafts section */}
            {recentDrafts.length > 0 ? (
                <div className={styles.railSection}>
                    <p className={styles.railSectionTitle}>Drafts</p>
                    <ul className={styles.railList}>
                        {recentDrafts.slice(0, 4).map((draft) => {
                            const pinned = isPinned(draft.id);
                            const isSending = sendingDraftId === draft.id;
                            const isConfirming = confirmingDraftId === draft.id;
                            return (
                                <li key={draft.id} className={styles.railItem}>
                                    <div className={styles.railItemHead}>
                                        <div className={styles.railItemContent}>
                                            <span className={styles.railItemTitle}>
                                                {truncateWithEllipsis(draft.subject || "(no subject)", 32)}
                                            </span>
                                            <span className={styles.railItemSubtitle}>
                                                To: {truncateWithEllipsis(draft.to, 28)}
                                            </span>
                                        </div>
                                        <div className={styles.railItemActions}>
                                            <button
                                                type="button"
                                                className={isConfirming ? styles.railSendButtonConfirm : styles.railSendButton}
                                                onClick={() => void handleSendDraft(draft.id)}
                                                disabled={isSending}
                                            >
                                                {isSending ? "Sending…" : isConfirming ? "Confirm send?" : "Send"}
                                            </button>
                                            <button
                                                type="button"
                                                className={pinned ? styles.railPinButtonActive : styles.railPinButton}
                                                onClick={() =>
                                                    pinned
                                                        ? onUnpin(draft.id)
                                                        : onPin({
                                                            type: "email",
                                                            id: draft.id,
                                                            title: draft.subject,
                                                            snippet: draft.snippet,
                                                            meta: { from: draft.to },
                                                        })
                                                }
                                            >
                                                {pinned ? "✕" : "+ pin"}
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </>
    );
}
