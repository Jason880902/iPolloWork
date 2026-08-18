/** @jsxImportSource react */
/**
 * Live2D pet renderer — mounts the template's cubism model via PIXI and
 * exposes the same interaction surface as the spritesheet renderer: click to
 * pet (plays TapBody), hover panel with feed/rename/hide, reaction bubbles.
 * Live2D templates do not follow agent activity with motion; activity arrives
 * as status bubbles only.
 */
import * as React from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-lipsyncpatch/cubism4";

import {
  AFFINITY_MAX,
  PET_NAME_MAX_LENGTH,
  type PetInteraction,
} from "./whale-contract";
import { rankOf } from "./whale-machine";
import type { WhaleFeedback } from "./WhaleSprite";

window.PIXI = PIXI;

declare global {
  interface Window {
    PIXI?: typeof PIXI;
    Live2DCubismCore?: unknown;
  }
}

export type Live2DSpriteProps = {
  /** The active template's model3.json URL. */
  modelUrl: string;
  /** Status line bubble (agent activity); hidden while feedback shows. */
  statusBubble?: string;
  /** Active reaction bubble, if any. */
  feedback: WhaleFeedback | null;
  /** Display name (user-renamable). */
  name: string;
  affinityPoints: number;
  treatsStocked: number;
  /** Bumped to request a happy motion (pet/feed/bubble events). */
  happySignal: number;
  onPet: () => void;
  onFeed: () => void;
  onHide: () => void;
  onRename: (name: string) => void;
  onFeedbackDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
};

type Live2DState = { app: PIXI.Application; model: Live2DModel } | "failed" | null;

const LIVE2D_INIT_MAX_ATTEMPTS = 6;
const LIVE2D_INIT_RETRY_DELAY_MS = 500;
const DRAG_SUPPRESS_PX = 4;

async function initLive2D(
  cache: { current: { url: string; state: Live2DState } | null },
  modelUrl: string,
): Promise<Live2DState> {
  if (cache.current?.url === modelUrl && cache.current.state) return cache.current.state;
  // The lib's own Cubism-framework startup retry window is only ~200ms, which
  // is easy to exhaust during page load in dev/HMR. Retry the whole init with
  // a longer backoff so the pet still comes up when the first attempt loses
  // the race.
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
      const model = await Live2DModel.from(modelUrl, { autoHitTest: true, autoFocus: false });
      app.stage.addChild(model);
      const state: Live2DState = { app, model };
      cache.current = { url: modelUrl, state };
      return state;
    } catch (error) {
      console.warn(`[pet] Live2D init attempt ${attempt}/${LIVE2D_INIT_MAX_ATTEMPTS} failed`, error);
      if (attempt === LIVE2D_INIT_MAX_ATTEMPTS) {
        cache.current = { url: modelUrl, state: "failed" };
        return "failed";
      }
      await new Promise((resolve) => setTimeout(resolve, LIVE2D_INIT_RETRY_DELAY_MS));
    }
  }
  return cache.current?.state ?? "failed";
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

function FallbackAvatar({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 160 200" className="h-44 w-36 drop-shadow-lg pet-float" aria-label={name} role="img">
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
      <path d="M72 100 Q80 107 88 100" stroke="#e11d48" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M118 104 Q128 120 124 138" stroke="#3b3561" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M42 104 Q32 120 36 138" stroke="#3b3561" strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Live2DSprite(props: Live2DSpriteProps) {
  const { statusBubble, feedback } = props;
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const cacheRef = React.useRef<{ url: string; state: Live2DState } | null>(null);
  const modelRef = React.useRef<Live2DModel | null>(null);
  const [ready, setReady] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const hideTimerRef = React.useRef<number | null>(null);
  const pointerRef = React.useRef<{ startX: number; startY: number } | null>(null);
  const draggedRef = React.useRef(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.Live2DCubismCore) {
      setReady(false);
      return;
    }
    let cancelled = false;
    void initLive2D(cacheRef, props.modelUrl).then((state) => {
      if (cancelled) return;
      if (state && state !== "failed") {
        host.appendChild(state.app.view as HTMLCanvasElement);
        layoutLive2D(state, host);
        modelRef.current = state.model;
        setReady(true);
      } else {
        setReady(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.modelUrl]);

  const lastHappyRef = React.useRef(props.happySignal);
  React.useEffect(() => {
    if (props.happySignal === lastHappyRef.current) return;
    lastHappyRef.current = props.happySignal;
    void modelRef.current?.motion("TapBody").catch(() => undefined);
  }, [props.happySignal]);

  const feedbackDoneRef = React.useRef(props.onFeedbackDone);
  feedbackDoneRef.current = props.onFeedbackDone;
  React.useEffect(() => {
    if (feedback === null) return;
    const timer = window.setTimeout(() => feedbackDoneRef.current(), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const rank = rankOf(props.affinityPoints);
  const showStatus = feedback === null && statusBubble !== undefined && statusBubble !== "";

  return (
    <div
      className={`whale-float${hovered && pointerRef.current === null ? " has-panel" : ""}`}
      onPointerEnter={() => {
        clearHideTimer();
        setHovered(true);
      }}
      onPointerLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        clearHideTimer();
        hideTimerRef.current = window.setTimeout(() => setHovered(false), 300);
      }}
    >
      <div
        className="whale-sprite"
        role="button"
        aria-label={props.name}
        style={{ width: 288, height: 320 }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pointerRef.current = { startX: event.clientX, startY: event.clientY };
          draggedRef.current = false;
          setHovered(false);
          props.onDragStart();
        }}
        onPointerMove={(event) => {
          const start = pointerRef.current;
          if (!start) return;
          if (
            Math.abs(event.clientX - start.startX) > DRAG_SUPPRESS_PX ||
            Math.abs(event.clientY - start.startY) > DRAG_SUPPRESS_PX
          ) {
            draggedRef.current = true;
          }
        }}
        onPointerUp={() => {
          pointerRef.current = null;
          props.onDragEnd();
        }}
        onPointerCancel={() => {
          pointerRef.current = null;
          props.onDragEnd();
        }}
        onClick={() => {
          if (draggedRef.current) return;
          props.onPet();
        }}
        onDoubleClick={() => {
          if (draggedRef.current) return;
          props.onOpenChat();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onOpenSettings();
        }}
      >
        <div ref={hostRef} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full" />
        {!ready ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <FallbackAvatar name={props.name} />
          </div>
        ) : null}
      </div>
      {feedback !== null && (
        <div
          key={feedback.at}
          className={`whale-bubble ${feedback.kind === "feed" ? "whale-bubble-feed" : "whale-bubble-pet"}`}
        >
          {feedback.text}
        </div>
      )}
      {showStatus && (
        <div className="whale-bubble whale-bubble-status" role="status" aria-live="polite">
          {statusBubble}
        </div>
      )}
      {hovered && pointerRef.current === null && (
        <div className="whale-panel" onPointerEnter={clearHideTimer}>
          {renaming ? (
            <div className="whale-rename-row">
              <input
                className="whale-name-input"
                value={nameDraft}
                maxLength={PET_NAME_MAX_LENGTH}
                placeholder="给她起个名字"
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    const trimmed = nameDraft.trim();
                    if (trimmed !== "") {
                      props.onRename(trimmed);
                      setRenaming(false);
                    }
                  } else if (event.key === "Escape") {
                    setRenaming(false);
                  }
                }}
              />
              <button
                type="button"
                className="whale-action"
                onClick={() => {
                  const trimmed = nameDraft.trim();
                  if (trimmed !== "") {
                    props.onRename(trimmed);
                    setRenaming(false);
                  }
                }}
              >
                确定
              </button>
            </div>
          ) : (
            <>
              <div className="whale-rank-row">
                <span className="whale-name-cell">{props.name}</span>
                <span>{rank.name}</span>
              </div>
              <div className="whale-rank-row">
                <span>小鱼干 ×{props.treatsStocked}</span>
                <span>
                  亲密 {props.affinityPoints}/{AFFINITY_MAX}
                </span>
              </div>
              <div className="whale-actions">
                <button type="button" className="whale-action" onClick={props.onFeed}>
                  喂食
                </button>
                <button
                  type="button"
                  className="whale-action"
                  onClick={() => {
                    setNameDraft(props.name);
                    setRenaming(true);
                  }}
                >
                  改名
                </button>
                <button type="button" className="whale-action" onClick={props.onHide}>
                  隐藏
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <style>{`
        @keyframes pet-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes pet-blink { 0%, 92%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.08); } }
        .pet-float { animation: pet-float 3.2s ease-in-out infinite; }
        .pet-eyes { transform-origin: 80px 82px; animation: pet-blink 4.6s ease-in-out infinite; }
        .whale-float { pointer-events: auto; user-select: none; -webkit-user-select: none; display: flex; flex-direction: column; align-items: center; position: relative; }
        .whale-sprite { touch-action: none; position: relative; cursor: grab; }
        .whale-sprite:active { cursor: grabbing; }
        .whale-bubble { white-space: nowrap; color: #fff; pointer-events: none; border-radius: 999px; margin-bottom: 6px; padding: 4px 10px; font-size: 12px; line-height: 1.4; animation: 2.6s ease-out forwards whale-bubble-pop; position: absolute; bottom: 100%; box-shadow: 0 2px 8px #00000040; }
        .whale-bubble-pet { background: #f472b6eb; }
        .whale-bubble-feed { background: #38bdf8eb; }
        .whale-bubble-status { text-overflow: ellipsis; background: #0f172ae6; border: 1px solid #7dd3fc80; max-width: min(280px, 100vw - 24px); animation: none; overflow: hidden; }
        /* Panel sits below the sprite (top:100%); bubbles stay above. */
        @keyframes whale-bubble-pop { 0% { opacity: 0; transform: translateY(6px) scale(0.85); } 15% { opacity: 1; transform: translateY(0) scale(1.05); } 25% { transform: translateY(0) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px) scale(0.95); } }
        .whale-panel { color: #e2e8f0; backdrop-filter: blur(6px); background: #0f172aeb; border: 1px solid #94a3b859; border-radius: 10px; flex-direction: column; gap: 6px; min-width: 148px; padding: 8px 10px; font-size: 12px; display: flex; position: absolute; top: calc(100% + 6px); box-shadow: 0 4px 16px #00000059; z-index: 10; }
        .whale-panel::after { content: ""; height: 14px; position: absolute; bottom: 100%; left: 0; right: 0; }
        .whale-rank-row { white-space: nowrap; justify-content: space-between; gap: 10px; display: flex; }
        .whale-name-cell { font-weight: 600; }
        .whale-rename-row { align-items: center; gap: 6px; display: flex; }
        .whale-name-input { color: #e2e8f0; background: #1e293be6; border: 1px solid #7dd3fc80; border-radius: 6px; outline: none; flex: 1; min-width: 0; padding: 3px 6px; font-size: 12px; }
        .whale-name-input:focus { border-color: #38bdf8; box-shadow: 0 0 0 2px #38bdf873; }
        .whale-actions { gap: 6px; display: flex; }
        .whale-action { cursor: pointer; color: #0f172a; background: linear-gradient(#7dd3fc, #38bdf8); border: none; border-radius: 6px; flex: 1; padding: 4px 8px; font-size: 12px; transition: filter 0.12s, box-shadow 0.12s; }
        .whale-action:hover { filter: brightness(1.08); }
        .whale-action:active { filter: brightness(0.94); }
        .whale-action:focus-visible { outline: none; box-shadow: 0 0 0 2px #38bdf8d9; }
        @media (prefers-reduced-motion: reduce) { .whale-bubble { opacity: 1; animation: none; } .whale-action { transition: none; } }
      `}</style>
    </div>
  );
}
