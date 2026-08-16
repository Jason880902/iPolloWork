/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useUpdateCheckRequestStore } from "../domains/settings/state/update-check-request";
import { useUiStateStore } from "./ui-state-store";

const NATIVE_MENU_OPEN_SETTINGS_EVENT = "ipollowork:native-menu:open-settings";
const NATIVE_MENU_TOGGLE_SIDEBAR_EVENT = "ipollowork:native-menu:toggle-sidebar";
const NATIVE_MENU_CHECK_UPDATES_EVENT = "ipollowork:native-menu:check-updates";
const PET_OPEN_SETTINGS_EVENT = "ipollowork:pet:open-settings";
const PET_OPEN_SESSION_EVENT = "ipollowork:pet:open-session";

export function AppMenuProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const toggleSidebar = useUiStateStore((state) => state.toggleSidebar);

  useEffect(() => {
    const openSettings = () => navigate("/settings/preferences");
    const openPetSettings = () => navigate("/settings/pet");
    const openPetSession = (event: Event) => {
      const sessionId = event instanceof CustomEvent
        ? (event.detail as { sessionId?: unknown } | null)?.sessionId
        : null;
      if (typeof sessionId !== "string" || !sessionId) return;
      // The legacy /session/:id route drops the session id when redirecting,
      // so jump straight to the workspace-scoped route when possible.
      const match = typeof window !== "undefined"
        ? window.location.hash.match(/\/workspace\/([^/]+)\//)
        : null;
      const workspaceId = match?.[1];
      if (workspaceId) {
        navigate(`/workspace/${workspaceId}/session/${encodeURIComponent(sessionId)}`);
      } else {
        navigate(`/session/${encodeURIComponent(sessionId)}`);
      }
    };
    const checkUpdates = () => {
      useUpdateCheckRequestStore.getState().requestUpdateCheck();
      navigate("/settings/updates");
    };

    window.addEventListener(NATIVE_MENU_OPEN_SETTINGS_EVENT, openSettings);
    window.addEventListener(NATIVE_MENU_TOGGLE_SIDEBAR_EVENT, toggleSidebar);
    window.addEventListener(NATIVE_MENU_CHECK_UPDATES_EVENT, checkUpdates);
    window.addEventListener(PET_OPEN_SETTINGS_EVENT, openPetSettings);
    window.addEventListener(PET_OPEN_SESSION_EVENT, openPetSession);
    return () => {
      window.removeEventListener(NATIVE_MENU_OPEN_SETTINGS_EVENT, openSettings);
      window.removeEventListener(NATIVE_MENU_TOGGLE_SIDEBAR_EVENT, toggleSidebar);
      window.removeEventListener(NATIVE_MENU_CHECK_UPDATES_EVENT, checkUpdates);
      window.removeEventListener(PET_OPEN_SETTINGS_EVENT, openPetSettings);
      window.removeEventListener(PET_OPEN_SESSION_EVENT, openPetSession);
    };
  }, [navigate, toggleSidebar]);

  return <>{children}</>;
}
