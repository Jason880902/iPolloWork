/** @jsxImportSource react */
import * as React from "react";
import ReactDOM from "react-dom/client";

import { bootstrapTheme } from "../app/theme";
import "../app/index.css";
import { petTemplateById, type PetTemplate } from "../react-app/kernel/pet-templates";
import {
  REACTION_FEED_EMPTY,
  REACTION_PET_COOLDOWN,
  type ActivityPhase,
  type PetAnimation,
} from "./whale-contract";
import {
  PetStateMachine,
  applyInteraction,
  applyTurnReward,
  consumeTreat,
  settleTreatGrants,
} from "./whale-machine";
import {
  loadWhaleCompanion,
  saveWhaleCompanion,
  type WhaleCompanionState,
} from "./whale-persist";
import { Live2DSprite } from "./Live2DSprite";
import { WhaleSprite, type WhaleFeedback } from "./WhaleSprite";

type PetBubble = {
  id: string;
  kind: "greeting" | "reminder" | "decision" | "praise";
  text: string;
  ttlMs?: number;
  action?: PetBubbleAction;
};

type PetBubbleAction =
  | { type: "open-session"; sessionId: string }
  | { type: "open-url"; url: string };

type PetChatMessage = {
  id: string;
  from: "user" | "pet";
  text: string;
};

type PetActivityPayload = {
  phase: ActivityPhase;
  line?: string;
  turnCompleted?: boolean;
};

type PetConfig = {
  templateId: string;
  nickname: string;
};

type PetApi = {
  ready: () => void;
  onBubble: (callback: (bubble: PetBubble) => void) => () => void;
  onActivity?: (callback: (activity: PetActivityPayload) => void) => () => void;
  getConfig?: () => Promise<PetConfig>;
  setConfig?: (patch: Partial<PetConfig>) => void;
  onConfig?: (callback: (config: PetConfig) => void) => () => void;
  setInteractive: (interactive: boolean) => void;
  dragStart: () => void;
  dragEnd: () => void;
  hide?: () => void;
  openSettings: () => void;
  performAction: (action: PetBubbleAction) => void;
  chat: (message: { id: string; text: string }) => void;
  focusWindow: () => void;
  onChatReply: (callback: (reply: { id: string; text: string }) => void) => () => void;
};

declare global {
  interface Window {
    __IPOLLOWORK_PET__?: PetApi;
  }
}

const DEFAULT_BUBBLE_TTL_MS = 6000;
const TREAT_SETTLE_TICK_MS = 60_000;
const MACHINE_RENDER_TICK_MS = 500;
const REACTION_ANIMATION_MS = 1400;

function BubbleView({ bubble, onAction }: { bubble: PetBubble; onAction: (action: PetBubbleAction) => void }) {
  const accent =
    bubble.kind === "decision"
      ? "border-amber-400"
      : bubble.kind === "praise"
        ? "border-pink-400"
        : bubble.kind === "reminder"
          ? "border-indigo-400"
          : "border-slate-300";
  const interactive = Boolean(bubble.action);
  return (
    <div
      className={`pet-bubble-in pointer-events-auto relative mx-auto mb-2 w-56 rounded-2xl border bg-white/95 px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-xl backdrop-blur dark:bg-slate-900/95 dark:text-slate-100 ${interactive ? "cursor-pointer transition-shadow hover:shadow-2xl hover:ring-2 hover:ring-indigo-300" : ""}`}
      onClick={() => {
        if (bubble.action) onAction(bubble.action);
      }}
      role={interactive ? "button" : undefined}
    >
      <div className={`absolute inset-0 rounded-2xl border-2 ${accent}`} />
      {bubble.text}
      {interactive ? (
        <div className="mt-1 text-right text-[11px] font-medium text-indigo-500">查看 →</div>
      ) : null}
      <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r bg-white/95 dark:bg-slate-900/95" />
    </div>
  );
}

function ChatPanel({
  name,
  messages,
  pending,
  onSend,
  onClose,
}: {
  name: string;
  messages: PetChatMessage[];
  pending: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pending]);

  return (
    <div className="pointer-events-auto absolute inset-x-3 top-2 z-20 flex max-h-[270px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
        <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">和{name}聊聊</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-[12px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          收起
        </button>
      </div>
      <div ref={listRef} className="flex min-h-[90px] flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="my-auto text-center text-[12px] text-slate-400">双击我打开对话框，随时叫我～</div>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.from === "user"
                ? "ml-8 self-end rounded-xl rounded-br-sm bg-indigo-500 px-2.5 py-1.5 text-[13px] text-white"
                : "mr-8 self-start rounded-xl rounded-bl-sm bg-slate-100 px-2.5 py-1.5 text-[13px] text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            }
          >
            {message.text}
          </div>
        ))}
        {pending ? <div className="mr-8 self-start text-[12px] text-slate-400">{name}正在想…</div> : null}
      </div>
      <form
        className="flex gap-1.5 border-t border-slate-100 p-2 dark:border-slate-800"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("pet-chat-input");
          if (!(input instanceof HTMLInputElement)) return;
          const text = input.value.trim();
          if (!text) return;
          input.value = "";
          onSend(text);
        }}
      >
        <input
          name="pet-chat-input"
          ref={inputRef}
          autoComplete="off"
          placeholder="说点什么…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-[13px] outline-none focus:border-indigo-400 dark:border-slate-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-500 px-2.5 text-[13px] text-white disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  );
}

function PetApp() {
  const [bubble, setBubble] = React.useState<PetBubble | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<PetChatMessage[]>([]);
  const [pending, setPending] = React.useState(false);
  const [companion, setCompanion] = React.useState<WhaleCompanionState>(() => loadWhaleCompanion());
  const [feedback, setFeedback] = React.useState<WhaleFeedback | null>(null);
  const [activityAnim, setActivityAnim] = React.useState<PetAnimation>("idle");
  const [statusBubble, setStatusBubble] = React.useState<string | undefined>(undefined);
  const [reactionAnim, setReactionAnim] = React.useState<{ track: PetAnimation; until: number } | null>(null);
  const [happySignal, setHappySignal] = React.useState(0);
  const [config, setConfig] = React.useState<PetConfig | null>(null);
  const machineRef = React.useRef<PetStateMachine | null>(null);
  const api = window.__IPOLLOWORK_PET__;

  if (machineRef.current === null) {
    machineRef.current = new PetStateMachine();
  }

  const template: PetTemplate = petTemplateById(config?.templateId);
  const petName = config?.nickname?.trim() || template.defaultName;

  const updateCompanion = React.useCallback(
    (updater: (current: WhaleCompanionState) => WhaleCompanionState) => {
      setCompanion((current) => {
        const next = updater(current);
        if (next !== current) saveWhaleCompanion(next);
        return next;
      });
    },
    [],
  );

  const showFeedback = React.useCallback((text: string, kind: WhaleFeedback["kind"]) => {
    setFeedback({ text, kind, at: Date.now() });
  }, []);

  const playReaction = React.useCallback((track: PetAnimation) => {
    setReactionAnim({ track, until: Date.now() + REACTION_ANIMATION_MS });
    setHappySignal((value) => value + 1);
  }, []);

  // Config: initial load + live updates from the settings page.
  React.useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.getConfig?.().then((next) => {
      if (!cancelled && next) setConfig(next);
    }).catch(() => undefined);
    const unsubscribe = api.onConfig?.((next) => {
      if (next) setConfig(next);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [api]);

  // Host pushes (event bubbles / chat replies / activity feed).
  React.useEffect(() => {
    if (!api) return;
    const unsubscribeBubble = api.onBubble((next) => {
      setBubble(next);
      playReaction(next.kind === "praise" ? "jumping" : "waving");
    });
    const unsubscribeChat = api.onChatReply((reply) => {
      setPending(false);
      setMessages((prev) => [...prev, { id: reply.id, from: "pet", text: reply.text }]);
      playReaction("waving");
    });
    const unsubscribeActivity = api.onActivity?.((payload) => {
      const machine = machineRef.current;
      if (!machine) return;
      machine.onActivity({ phase: payload.phase, line: payload.line });
      if (payload.turnCompleted) {
        updateCompanion((current) => {
          const rewarded = applyTurnReward(current.affinity);
          const settled = settleTreatGrants(current.treats, rewarded.turns);
          return { ...current, affinity: rewarded, treats: settled.ledger };
        });
      }
      const snapshot = machine.render();
      setActivityAnim(snapshot.animation);
      setStatusBubble(snapshot.bubble);
    });
    api.ready();
    api.setInteractive(true);
    return () => {
      unsubscribeBubble();
      unsubscribeChat();
      unsubscribeActivity?.();
    };
  }, [api, playReaction, updateCompanion]);

  // Machine render tick: celebration windows expire and one-shot reaction
  // animations fall back to the activity track without new pushes.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = machineRef.current?.render();
      if (!snapshot) return;
      setActivityAnim(snapshot.animation);
      setStatusBubble(snapshot.bubble);
      setReactionAnim((current) => (current && Date.now() >= current.until ? null : current));
    }, MACHINE_RENDER_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Lazy treat settlement: wall-clock grants accrue while the pet idles.
  React.useEffect(() => {
    const settle = () => {
      updateCompanion((current) => {
        const settled = settleTreatGrants(current.treats, current.affinity.turns);
        return settled.ledger === current.treats ? current : { ...current, treats: settled.ledger };
      });
    };
    settle();
    const timer = window.setInterval(settle, TREAT_SETTLE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [updateCompanion]);

  React.useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble(null), bubble.ttlMs ?? DEFAULT_BUBBLE_TTL_MS);
    return () => clearTimeout(timer);
  }, [bubble]);

  if (!api) return null;

  const handlePet = () => {
    const outcome = applyInteraction(companion.affinity, "pet");
    if (outcome.accepted) {
      updateCompanion((current) => ({ ...current, affinity: outcome.affinity }));
      playReaction("waving");
    }
    showFeedback(outcome.reaction.replaceAll("{name}", petName), "pet");
  };

  const handleFeed = () => {
    // Feeding settles first, then gates on the cooldown before spending
    // stock — a feed inside the cooldown must not burn a treat for nothing.
    const settled = settleTreatGrants(companion.treats, companion.affinity.turns);
    const outcome = applyInteraction(companion.affinity, "feed");
    if (!outcome.accepted) {
      if (settled.ledger !== companion.treats) {
        updateCompanion((current) => ({ ...current, treats: settled.ledger }));
      }
      showFeedback(outcome.reaction, "feed");
      return;
    }
    const consume = consumeTreat(settled.ledger);
    if (!consume.ok) {
      if (settled.ledger !== companion.treats) {
        updateCompanion((current) => ({ ...current, treats: settled.ledger }));
      }
      showFeedback(REACTION_FEED_EMPTY, "feed");
      return;
    }
    updateCompanion((current) => ({ ...current, affinity: outcome.affinity, treats: consume.ledger }));
    playReaction("jumping");
    showFeedback(outcome.reaction, "feed");
  };

  const handleRename = (name: string) => {
    if (api.setConfig) {
      api.setConfig({ nickname: name });
      setConfig((current) => ({
        templateId: current?.templateId ?? template.id,
        nickname: name,
      }));
    }
    showFeedback(`以后叫我「${name}」吧～`, "pet");
  };

  const handleHide = () => {
    if (api.hide) {
      api.hide();
    } else {
      api.openSettings();
    }
  };

  const sendChat = (text: string) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, from: "user", text }]);
    setPending(true);
    api.chat({ id, text });
  };

  const animation = reactionAnim && Date.now() < reactionAnim.until ? reactionAnim.track : activityAnim;
  const spriteTemplate = template.kind === "spritesheet" ? template : null;

  return (
    <div className="relative flex h-dvh flex-col items-center justify-end pb-[140px]">
      {chatOpen ? (
        <ChatPanel
          name={petName}
          messages={messages}
          pending={pending}
          onSend={sendChat}
          onClose={() => setChatOpen(false)}
        />
      ) : null}
      {!chatOpen && bubble ? <BubbleView bubble={bubble} onAction={(action) => api.performAction(action)} /> : null}
      {spriteTemplate?.sprite ? (
        <WhaleSprite
          sprite={spriteTemplate.sprite}
          animation={animation}
          statusBubble={statusBubble}
          feedback={feedback}
          name={petName}
          affinityPoints={companion.affinity.points}
          treatsStocked={companion.treats.treats}
          onPet={handlePet}
          onFeed={handleFeed}
          onHide={handleHide}
          onRename={handleRename}
          onFeedbackDone={() => setFeedback(null)}
          onDragStart={() => api.dragStart()}
          onDragEnd={() => api.dragEnd()}
          onOpenChat={() => {
            setChatOpen((open) => {
              if (!open) api.focusWindow();
              return !open;
            });
          }}
          onOpenSettings={() => api.openSettings()}
        />
      ) : (
        <Live2DSprite
          modelUrl={template.modelUrl ?? ""}
          statusBubble={statusBubble}
          feedback={feedback}
          name={petName}
          affinityPoints={companion.affinity.points}
          treatsStocked={companion.treats.treats}
          happySignal={happySignal}
          onPet={handlePet}
          onFeed={handleFeed}
          onHide={handleHide}
          onRename={handleRename}
          onFeedbackDone={() => setFeedback(null)}
          onDragStart={() => api.dragStart()}
          onDragEnd={() => api.dragEnd()}
          onOpenChat={() => {
            setChatOpen((open) => {
              if (!open) api.focusWindow();
              return !open;
            });
          }}
          onOpenSettings={() => api.openSettings()}
        />
      )}
      <style>{`
        @keyframes pet-bubble-in { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pet-bubble-in { animation: pet-bubble-in 0.25s ease-out; }
      `}</style>
    </div>
  );
}

bootstrapTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Pet root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>,
);
