/** @jsxImportSource react */
import * as React from "react";
import ReactDOM from "react-dom/client";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-lipsyncpatch/cubism4";

import { bootstrapTheme } from "../app/theme";
import "../app/index.css";

type PetBubble = {
  id: string;
  kind: "greeting" | "reminder" | "decision" | "praise";
  text: string;
  ttlMs?: number;
};

type PetChatMessage = {
  id: string;
  from: "user" | "pet";
  text: string;
};

type PetApi = {
  ready: () => void;
  onBubble: (callback: (bubble: PetBubble) => void) => () => void;
  setInteractive: (interactive: boolean) => void;
  dragStart: () => void;
  dragEnd: () => void;
  openSettings: () => void;
  chat: (message: { id: string; text: string }) => void;
  focusWindow: () => void;
  onChatReply: (callback: (reply: { id: string; text: string }) => void) => () => void;
};

declare global {
  interface Window {
    __IPOLLOWORK_PET__?: PetApi;
    PIXI?: typeof PIXI;
    Live2DCubismCore?: unknown;
  }
}

window.PIXI = PIXI;

const DEFAULT_BUBBLE_TTL_MS = 6000;
const PET_MODEL_URL = "pet-models/hiyori/Hiyori.model3.json";

function FallbackAvatar({ excited }: { excited: boolean }) {
  return (
    <svg
      viewBox="0 0 160 200"
      className={`h-44 w-36 drop-shadow-lg ${excited ? "pet-bounce" : "pet-float"}`}
      aria-label="iPolloWork assistant"
      role="img"
    >
      <ellipse cx="80" cy="188" rx="42" ry="8" fill="rgba(15,23,42,0.18)" />
      <path d="M40 92 Q34 160 52 176 Q80 190 108 176 Q126 160 120 92 Z" fill="#6366f1" />
      <path d="M52 176 Q80 190 108 176 L104 168 Q80 180 56 168 Z" fill="#4f46e5" />
      <circle cx="80" cy="78" r="46" fill="#ffe4d6" />
      <path d="M34 78 Q30 30 80 28 Q130 30 126 78 Q126 96 118 104 Q124 60 104 48 Q112 76 100 82 Q108 52 80 46 Q52 52 60 82 Q48 76 56 48 Q36 60 42 104 Q34 96 34 78 Z" fill="#3b3561" />
      <g className="pet-eyes">
        <ellipse cx="64" cy="82" rx="6.5" ry="8.5" fill="#2d2a45" />
        <ellipse cx="96" cy="82" rx="6.5" ry="8.5" fill="#2d2a45" />
        <circle cx="66.5" cy="79" r="2.2" fill="#ffffff" />
        <circle cx="98.5" cy="79" r="2.2" fill="#ffffff" />
      </g>
      <ellipse cx="54" cy="96" rx="7" ry="4" fill="#ffb3c1" opacity="0.7" />
      <ellipse cx="106" cy="96" rx="7" ry="4" fill="#ffb3c1" opacity="0.7" />
      {excited ? (
        <path d="M70 100 Q80 112 90 100 Q80 106 70 100 Z" fill="#e11d48" />
      ) : (
        <path d="M72 100 Q80 107 88 100" stroke="#e11d48" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      <path d="M118 104 Q128 120 124 138" stroke="#3b3561" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M42 104 Q32 120 36 138" stroke="#3b3561" strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}

let live2dState: { app: PIXI.Application; model: Live2DModel } | "failed" | null = null;
let live2dInitPromise: Promise<typeof live2dState> | null = null;

const LIVE2D_INIT_MAX_ATTEMPTS = 6;
const LIVE2D_INIT_RETRY_DELAY_MS = 500;

async function initLive2D(): Promise<typeof live2dState> {
  if (live2dState) return live2dState;
  // The lib's own Cubism-framework startup retry window is only ~200ms, which
  // is easy to exhaust during page load in dev/HMR. Retry the whole init with
  // a longer backoff so the pet still comes up when the first attempt loses
  // the race.
  live2dInitPromise ??= (async () => {
    for (let attempt = 1; attempt <= LIVE2D_INIT_MAX_ATTEMPTS; attempt++) {
      try {
        const canvas = document.createElement("canvas");
        const app = new PIXI.Application({
          view: canvas,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        const model = await Live2DModel.from(PET_MODEL_URL, { autoHitTest: true, autoFocus: false });
        app.stage.addChild(model);
        live2dState = { app, model };
        return live2dState;
      } catch (error) {
        console.warn(`[pet] Live2D init attempt ${attempt}/${LIVE2D_INIT_MAX_ATTEMPTS} failed`, error);
        if (attempt === LIVE2D_INIT_MAX_ATTEMPTS) {
          console.warn("[pet] Live2D init failed, using fallback avatar");
          live2dState = "failed";
          return live2dState;
        }
        await new Promise((resolve) => setTimeout(resolve, LIVE2D_INIT_RETRY_DELAY_MS));
      }
    }
    return live2dState;
  })();
  return live2dInitPromise;
}

function layoutLive2D(state: { app: PIXI.Application; model: Live2DModel }, host: HTMLElement) {
  const bounds = host.getBoundingClientRect();
  state.app.renderer.resize(bounds.width, bounds.height);
  const scale = Math.min((bounds.width * 0.96) / state.model.width, (bounds.height * 0.96) / state.model.height);
  state.model.scale.set(scale);
  state.model.anchor.set(0.5, 1);
  state.model.x = bounds.width / 2;
  state.model.y = bounds.height;
}

function Live2DAvatar({ onReady }: { onReady: (model: Live2DModel | null) => void }) {
  const hostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.Live2DCubismCore) {
      onReady(null);
      return;
    }
    let cancelled = false;
    void initLive2D().then((state) => {
      if (cancelled) return;
      if (state && state !== "failed") {
        host.appendChild(state.app.view as HTMLCanvasElement);
        layoutLive2D(state, host);
        onReady(state.model);
      } else {
        onReady(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return <div ref={hostRef} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full" />;
}

function BubbleView({ bubble }: { bubble: PetBubble }) {
  const accent =
    bubble.kind === "decision"
      ? "border-amber-400"
      : bubble.kind === "praise"
        ? "border-pink-400"
        : bubble.kind === "reminder"
          ? "border-indigo-400"
          : "border-slate-300";
  return (
    <div className="pet-bubble-in pointer-events-auto relative mx-auto mb-2 w-56 rounded-2xl border bg-white/95 px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-xl backdrop-blur dark:bg-slate-900/95 dark:text-slate-100">
      <div className={`absolute inset-0 rounded-2xl border-2 ${accent}`} />
      {bubble.text}
      <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r bg-white/95 dark:bg-slate-900/95" />
    </div>
  );
}

function ChatPanel({
  messages,
  pending,
  onSend,
  onClose,
}: {
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
    <div className="pointer-events-auto absolute inset-x-3 top-2 flex max-h-[270px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
        <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">和小珀聊聊</span>
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
        {pending ? <div className="mr-8 self-start text-[12px] text-slate-400">小珀正在想…</div> : null}
      </div>
      <form
        className="flex gap-1.5 border-t border-slate-100 p-2 dark:border-slate-800"
        onSubmit={(event) => {          event.preventDefault();
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
  const [excited, setExcited] = React.useState(false);
  const [live2dReady, setLive2dReady] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<PetChatMessage[]>([]);
  const [pending, setPending] = React.useState(false);
  const modelRef = React.useRef<Live2DModel | null>(null);
  const api = window.__IPOLLOWORK_PET__;

  const playHappy = React.useCallback(() => {
    const model = modelRef.current;
    if (model) {
      void model.motion("TapBody").catch(() => undefined);
    }
  }, []);

  const handleModelReady = React.useCallback((model: Live2DModel | null) => {
    modelRef.current = model;
    setLive2dReady(Boolean(model));
  }, []);

  React.useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onBubble((next) => {
      setBubble(next);
      setExcited(true);
      playHappy();
    });
    const unsubscribeChat = api.onChatReply((reply) => {
      setPending(false);
      setMessages((prev) => [...prev, { id: reply.id, from: "pet", text: reply.text }]);
      playHappy();
    });
    api.ready();
    api.setInteractive(true);
    return () => {
      unsubscribe();
      unsubscribeChat();
    };
  }, [api, playHappy]);

  React.useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => {
      setBubble(null);
      setExcited(false);
    }, bubble.ttlMs ?? DEFAULT_BUBBLE_TTL_MS);
    return () => clearTimeout(timer);
  }, [bubble]);

  if (!api) return null;

  const sendChat = (text: string) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, from: "user", text }]);
    setPending(true);
    api.chat({ id, text });
  };

  return (
    <div className="relative flex h-dvh flex-col items-center justify-end pb-1">
      {chatOpen ? (
        <ChatPanel messages={messages} pending={pending} onSend={sendChat} onClose={() => setChatOpen(false)} />
      ) : null}
      {!chatOpen && bubble ? <BubbleView bubble={bubble} /> : null}
      <div
        className="relative h-[336px] w-[312px] cursor-grab touch-none active:cursor-grabbing"
        onContextMenu={(event) => {
          event.preventDefault();
          api.openSettings();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          api.dragStart();
        }}
        onPointerUp={() => api.dragEnd()}
        onPointerCancel={() => api.dragEnd()}
        onClick={() => {
          playHappy();
          if (!bubble) {
            setBubble({ id: `local-${Date.now()}`, kind: "greeting", text: "韩大哥，我在这里呢～有我在，进度和决策都不会漏掉！" });
            setExcited(true);
          }
        }}
        onDoubleClick={() => {
          setChatOpen((open) => {
            if (!open) api.focusWindow();
            return !open;
          });
        }}
      >
        <Live2DAvatar onReady={handleModelReady} />
        {!live2dReady ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <FallbackAvatar excited={excited} />
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes pet-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes pet-bounce { 0%, 100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-14px) scale(1.04); } 60% { transform: translateY(0) scale(0.98); } }
        @keyframes pet-bubble-in { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes pet-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.08); } }
        .pet-float { animation: pet-float 3.2s ease-in-out infinite; }
        .pet-bounce { animation: pet-bounce 0.7s ease-in-out; }
        .pet-bubble-in { animation: pet-bubble-in 0.25s ease-out; }
        .pet-eyes { transform-origin: 80px 82px; animation: pet-blink 4.6s ease-in-out infinite; }
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
