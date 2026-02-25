"use client";

import { useState } from "react";
import type { ThreadSummary } from "../types";
import styles from "../dashboard.module.css";

interface ServiceChip {
    name: string;
    icon: string;
    count: number | null;
    connected: boolean;
}

interface LeftSidebarProps {
    agentOnline: boolean;
    gmailCount: number;
    calendarCount: number;
    slackConnected: boolean;
    threads: ThreadSummary[];
    agentThreadId: string | null;
    agentThreadOpeningId: string | null;
    onOpenThread: (threadId: string) => void;
    onNewConversation: () => void;
    showSettings: boolean;
    onSettingsToggle: () => void;
    formatDateTime: (iso: string) => string;
    truncateWithEllipsis: (text: string, maxLength: number) => string;
}

export function LeftSidebar({
    agentOnline,
    gmailCount,
    calendarCount,
    slackConnected,
    threads,
    agentThreadId,
    agentThreadOpeningId,
    onOpenThread,
    onNewConversation,
    showSettings,
    onSettingsToggle,
    formatDateTime,
    truncateWithEllipsis,
}: LeftSidebarProps) {
    const [slackTooltipOpen, setSlackTooltipOpen] = useState(false);

    const services: ServiceChip[] = [
        {
            name: "Gmail",
            icon: "M",
            count: gmailCount > 0 ? gmailCount : null,
            connected: true,
        },
        {
            name: "Google Calendar",
            icon: "C",
            count: calendarCount > 0 ? calendarCount : null,
            connected: true,
        },
        {
            name: "Slack",
            icon: "S",
            count: null,
            connected: slackConnected,
        },
    ];

    return (
        <>
            {/* Identity */}
            <div className={styles.sidebarIdentity}>
                <div className={styles.sidebarAvatarRow}>
                    <div className={styles.sidebarAvatar}>A</div>
                    <div>
                        <p className={styles.sidebarAgentName}>Alik</p>
                        <div className={styles.sidebarStatusRow}>
                            <span
                                className={
                                    agentOnline
                                        ? styles.sidebarStatusDot
                                        : styles.sidebarStatusDotOff
                                }
                            />
                            <span className={styles.sidebarStatusLabel}>
                                {agentOnline ? "online" : "offline"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Service chips */}
            <div className={styles.sidebarServices}>
                {services.map((svc) => {
                    const isSlackDisconnected = svc.name === "Slack" && !svc.connected;
                    return (
                        <div
                            key={svc.name}
                            className={
                                svc.connected
                                    ? styles.sidebarServiceChip
                                    : styles.sidebarServiceChipOff
                            }
                            style={{ position: "relative" }}
                            onClick={isSlackDisconnected ? () => setSlackTooltipOpen((v) => !v) : undefined}
                        >
                            <span className={styles.sidebarServiceIcon}>{svc.icon}</span>
                            <span className={styles.sidebarServiceName}>{svc.name}</span>
                            {svc.count !== null ? (
                                <span className={styles.sidebarServiceBadge}>{svc.count}</span>
                            ) : null}
                            {isSlackDisconnected && slackTooltipOpen ? (
                                <div className={styles.slackChipTooltip}>
                                    <strong>Connect Slack</strong>
                                    <br />
                                    You&apos;ll need a Slack User Token.{" "}
                                    <a
                                        href="https://api.slack.com/apps"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.slackChipTooltipLink}
                                    >
                                        Get one here →
                                    </a>
                                    <br />
                                    Then paste it in Settings <span style={{ opacity: 0.7 }}>⚙</span>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {/* Thread list */}
            <div className={styles.sidebarThreadSection}>
                <button
                    type="button"
                    className={styles.sidebarNewThreadButton}
                    onClick={onNewConversation}
                >
                    + New conversation
                </button>
                <ul className={styles.sidebarThreadList}>
                    {threads.map((thread) => {
                        const isOpen = thread.id === agentThreadId;
                        const isOpening = thread.id === agentThreadOpeningId;
                        return (
                            <li key={thread.id}>
                                <button
                                    type="button"
                                    className={
                                        isOpen
                                            ? `${styles.sidebarThreadItem} ${styles.sidebarThreadItemActive}`
                                            : styles.sidebarThreadItem
                                    }
                                    onClick={() => onOpenThread(thread.id)}
                                    disabled={isOpening}
                                >
                                    <span className={styles.sidebarThreadTitle}>
                                        {thread.lastMessageTextPreview
                                            ? truncateWithEllipsis(thread.lastMessageTextPreview, 48)
                                            : thread.id}
                                    </span>
                                    <span className={styles.sidebarThreadDate}>
                                        {formatDateTime(thread.lastMessageAt ?? thread.updatedAt ?? "")}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Settings at bottom */}
            <div className={styles.sidebarFooter}>
                <button
                    type="button"
                    className={showSettings ? `${styles.sidebarSettingsIcon} ${styles.sidebarSettingsIconActive}` : styles.sidebarSettingsIcon}
                    aria-label={showSettings ? "Close settings" : "Open settings"}
                    data-settings-toggle="true"
                    onClick={onSettingsToggle}
                >
                    ⚙
                </button>
                {showSettings ? (
                    <span className={styles.sidebarSettingsLabel}>Settings</span>
                ) : null}
            </div>
        </>
    );
}
