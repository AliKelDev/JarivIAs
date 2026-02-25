import { useCallback, useEffect, useRef, useState } from "react";

export function useDashboardNavigation() {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const targetElement = target as HTMLElement;
      if (targetElement.closest("[data-settings-toggle='true']")) {
        return;
      }

      if (settingsOverlayRef.current?.contains(target)) {
        return;
      }

      setShowSettings(false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [showSettings]);

  const toggleChatExpanded = useCallback(() => {
    setChatExpanded((value) => !value);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((value) => !value);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  return {
    chatExpanded,
    toggleChatExpanded,
    showSettings,
    toggleSettings,
    closeSettings,
    settingsOverlayRef,
  };
}
