/** @jsxImportSource react */
import type { Client } from "../../../app/types";
import type { McpDirectoryInfo } from "../../../app/constants";

import { McpAuthModal } from "./mcp-auth-modal";
import { McpEnvModal } from "./mcp-env-modal";

export type ConnectionsModalsState = {
  mcpAuthModalOpen: boolean;
  mcpAuthEntry: McpDirectoryInfo | null;
  mcpAuthNeedsReload: boolean;
  mcpEnvRequirements: { entry: McpDirectoryInfo; missing: string[] } | null;
  mcpEnvSaving: boolean;
  mcpEnvError: string | null;
};

export type ConnectionsModalsProps = {
  client: Client | null;
  projectDir: string;
  reloadBlocked: boolean;
  activeSessions: Array<{ id: string; title: string }>;
  isRemoteWorkspace: boolean;
  onForceStopSession: (sessionID: string) => void | Promise<void>;
  onReloadEngine: () => void | Promise<void>;
  modalState: ConnectionsModalsState;
  onCloseMcpAuthModal: () => void;
  onCompleteMcpAuthModal: () => void | Promise<void>;
  onSubmitMcpEnv: (values: Record<string, string>) => void | Promise<void>;
  onCloseMcpEnv: () => void;
};

export default function ConnectionsModals(props: ConnectionsModalsProps) {
  const envRequirements = props.modalState.mcpEnvRequirements;
  return (
    <>
      <McpAuthModal
        open={props.modalState.mcpAuthModalOpen}
        client={props.client}
        entry={props.modalState.mcpAuthEntry}
        projectDir={props.projectDir}
        reloadRequired={props.modalState.mcpAuthNeedsReload}
        reloadBlocked={props.reloadBlocked}
        activeSessions={props.activeSessions}
        isRemoteWorkspace={props.isRemoteWorkspace}
        onForceStopSession={props.onForceStopSession}
        onClose={props.onCloseMcpAuthModal}
        onComplete={props.onCompleteMcpAuthModal}
        onReloadEngine={props.onReloadEngine}
      />
      <McpEnvModal
        open={envRequirements !== null}
        serverName={envRequirements?.entry.name ?? ""}
        missing={envRequirements?.missing ?? []}
        helpUrl={envRequirements?.entry.helpUrl}
        saving={props.modalState.mcpEnvSaving}
        error={props.modalState.mcpEnvError}
        onSubmit={props.onSubmitMcpEnv}
        onClose={props.onCloseMcpEnv}
      />
    </>
  );
}
