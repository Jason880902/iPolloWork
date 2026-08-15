import { useEffect, useRef } from "react";

import { petChatReply } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import {
  petEngineRequestJson,
  resolvePetEngineHandle,
  type PetEngineHandle,
} from "../kernel/pet-engine";
import { readPetPersona } from "../kernel/pet-persona";

const PET_CHAT_REQUEST_EVENT = "ipollowork:pet:chat-request";

const PET_COMPANION_SESSION_TITLE = "桌面助手小珀";

const PET_CHAT_POLL_MS = 2_000;
const PET_CHAT_TIMEOUT_MS = 90_000;

const PET_CHECK_SYSTEM_PROMPT = `你是工作助理。用你可用的工具检查用户的待办、审批、日程提醒。
规则：有需要用户处理的事项时，用一句话概括最重要的（不超过50字）；没有任何待处理事项，或者你没有钉钉/飞书相关工具可用时，只回复 NONE。`;

type PetChatRequest = {
  id: string;
  text: string;
  internal?: boolean;
};

type MessageListItem = {
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
};

/**
 * Bridge between the floating pet window and the desktop engine. The pet
 * window never touches tokens or the engine directly: it relays chat through
 * the main process, and this hook (running in the always-alive main renderer)
 * owns the authenticated requests and the companion session.
 */
export function usePetCompanionBridge() {
  const sessionIdRef = useRef<string | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    const onChatRequest = async (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as Partial<PetChatRequest>) : null;
      const id = typeof detail?.id === "string" ? detail.id : null;
      const text = typeof detail?.text === "string" ? detail.text.trim() : "";
      const internal = detail?.internal === true;
      if (!id || !text || pendingRef.current) return;
      pendingRef.current = true;

      const reply = async (replyText: string) => {
        await petChatReply({ id, text: replyText, ...(internal ? { internal: true } : {}) }).catch(() => undefined);
      };

      try {
        const handle = await resolvePetEngineHandle();
        if (!handle) throw new Error("engine handle unavailable");

        if (!sessionIdRef.current) {
          const created = await petEngineRequestJson<{ id?: string }>(`${handle.mount}/session`, handle, {
            method: "POST",
            body: JSON.stringify({ title: PET_COMPANION_SESSION_TITLE }),
          });
          if (!created?.id) throw new Error("pet companion session create failed");
          sessionIdRef.current = created.id;
        }
        const sessionId = sessionIdRef.current;

        // The proxy serves reads under /opencode/api/* but prompts and the
        // live message log must go to /opencode/* (the recipe the app UI uses).
        const directMount = handle.mount.replace(/\/opencode\/api$/, "/opencode");
        const promptUrl = `${directMount}/session/${sessionId}/prompt_async`;
        const response = await fetch(promptUrl, {
          method: "POST",
          headers: handle.headers,
          body: JSON.stringify({
            system: internal ? PET_CHECK_SYSTEM_PROMPT : readPetPersona(),
            parts: [{ type: "text", text }],
          }),
        });
        if (!response.ok) throw new Error("pet companion prompt rejected");

        const deadline = Date.now() + PET_CHAT_TIMEOUT_MS;
        let replyText = "";
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, PET_CHAT_POLL_MS));
          const messages = await petEngineRequestJson<MessageListItem[]>(`${directMount}/session/${sessionId}/message?limit=20`, handle);
          const assistant = (Array.isArray(messages) ? messages : [])
            .filter((message) => message.info?.role === "assistant")
            .pop();
          const candidate = (assistant?.parts ?? [])
            .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
            .join("")
            .trim();
          if (candidate) {
            replyText = candidate;
            break;
          }
        }
        await reply(replyText || (internal ? "NONE" : "呜……我一时没想好怎么回答，再说一遍嘛。"));
      } catch (error) {
        console.warn("[pet] companion chat failed", error);
        await reply(internal ? "NONE" : "我现在连不上大脑了，稍后再找我聊嘛。");
      } finally {
        pendingRef.current = false;
      }
    };

    window.addEventListener(PET_CHAT_REQUEST_EVENT, onChatRequest);
    return () => window.removeEventListener(PET_CHAT_REQUEST_EVENT, onChatRequest);
  }, []);
}
