/** @jsxImportSource react */
/**
 * Spritesheet pet renderer — renders the template's atlas with a
 * requestAnimationFrame frame loop (per-frame durations, scaled
 * background-position), and hosts the interaction surface: click to pet,
 * hover panel with feed/rename/hide, reaction bubbles. Frame loop and visuals
 * ported from @linxin666/dsh-pet (Apache-2.0, (c) zhu1090093659).
 */
import * as React from "react";

import type { SpriteSheetDef } from "../react-app/kernel/pet-templates";
import {
  AFFINITY_MAX,
  PET_NAME_MAX_LENGTH,
  type PetAnimation,
  type PetInteraction,
} from "./whale-contract";
import { rankOf } from "./whale-machine";

export type WhaleFeedback = {
  text: string;
  kind: PetInteraction | "none";
  at: number;
};

export type WhaleSpriteProps = {
  /** The active template's spritesheet definition. */
  sprite: SpriteSheetDef;
  /** Animation the state machine decided on. */
  animation: PetAnimation;
  /** Status line bubble (agent activity); hidden while feedback shows. */
  statusBubble?: string;
  /** Active reaction bubble, if any. */
  feedback: WhaleFeedback | null;
  /** Display name (user-renamable). */
  name: string;
  affinityPoints: number;
  treatsStocked: number;
  onPet: () => void;
  onFeed: () => void;
  onHide: () => void;
  onRename: (name: string) => void;
  onFeedbackDone: () => void;
  /** Window drag passthrough (pointer down/up on the sprite). */
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
};

const DRAG_SUPPRESS_PX = 4;

export function WhaleSprite(props: WhaleSpriteProps) {
  const { sprite, animation, statusBubble, feedback } = props;
  const spriteRef = React.useRef<HTMLDivElement | null>(null);
  const [imageReady, setImageReady] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const hideTimerRef = React.useRef<number | null>(null);
  const frameRef = React.useRef<{ track: PetAnimation | null; index: number; elapsed: number }>({
    track: null,
    index: 0,
    elapsed: 0,
  });
  const pointerRef = React.useRef<{ startX: number; startY: number } | null>(null);
  const draggedRef = React.useRef(false);

  const scale = sprite.displaySize / sprite.cellHeight;
  const spriteWidth = Math.round(sprite.cellWidth * scale);
  const spriteHeight = Math.round(sprite.cellHeight * scale);

  React.useEffect(() => {
    let cancelled = false;
    setImageReady(false);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImageReady(true);
    };
    img.src = sprite.atlasUrl;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [sprite.atlasUrl]);

  // Frame loop: write background-position in SCALED coordinates (the
  // background image is scaled by `scale`, so offsets ride the same factor).
  const scaleRef = React.useRef(scale);
  scaleRef.current = scale;
  React.useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    const rowOf = (trackName: PetAnimation) => sprite.rowOrder.indexOf(trackName);
    const paint = (trackName: PetAnimation, index: number) => {
      const row = rowOf(trackName);
      const col = Math.min(index, (sprite.rowFrames[row] ?? 1) - 1);
      const el = spriteRef.current;
      if (!el) return;
      el.style.backgroundPosition = `${-col * sprite.cellWidth * scaleRef.current}px ${-row * sprite.cellHeight * scaleRef.current}px`;
    };
    paint(animation, 0);
    if (reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (ts: number) => {
      const delta = ts - last;
      last = ts;
      const row = rowOf(animation);
      const frameCount = sprite.rowFrames[row] ?? 1;
      const track = sprite.tracks[animation];
      const st = frameRef.current;
      if (st.track !== animation) {
        st.track = animation;
        st.index = 0;
        st.elapsed = 0;
      }
      st.elapsed += delta;
      const maxIndex = Math.min(track.durations.length, frameCount) - 1;
      while (st.elapsed >= (track.durations[st.index] ?? 0) && st.index < maxIndex) {
        st.elapsed -= track.durations[st.index] ?? 0;
        st.index += 1;
      }
      if (st.elapsed >= (track.durations[st.index] ?? 0)) {
        if (track.loop) {
          st.elapsed = 0;
          st.index = 0;
        } else {
          st.index = maxIndex; // hold the final frame; the driver switches tracks
        }
      }
      paint(animation, st.index);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, sprite]);

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
        ref={spriteRef}
        className="whale-sprite"
        role="button"
        aria-label={props.name}
        style={{
          width: spriteWidth,
          height: spriteHeight,
          backgroundImage: imageReady ? `url(${sprite.atlasUrl})` : undefined,
          backgroundSize: `${sprite.cellWidth * sprite.columns * scale}px ${sprite.cellHeight * sprite.rowOrder.length * scale}px`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 0",
        }}
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
          // A pointer sequence that moved (dragged) still fires a trailing
          // click; skip the pet when that happened.
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
      />
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
                  // While an IME composition is active, Enter/Escape belong to
                  // the input method — ignore them so candidate selection can
                  // neither submit the draft nor close the rename box.
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
      <style>{WHALE_CSS}</style>
    </div>
  );
}

const WHALE_CSS = `
.whale-float {
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.whale-sprite {
  image-rendering: auto;
  touch-action: none;
  position: relative;
  cursor: grab;
}
.whale-sprite:active {
  cursor: grabbing;
}
.whale-bubble {
  white-space: nowrap;
  color: #fff;
  pointer-events: none;
  border-radius: 999px;
  margin-bottom: 6px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  animation: 2.6s ease-out forwards whale-bubble-pop;
  position: absolute;
  bottom: 100%;
  box-shadow: 0 2px 8px #00000040;
}
.whale-bubble-pet {
  background: #f472b6eb;
}
.whale-bubble-feed {
  background: #38bdf8eb;
}
.whale-bubble-status {
  text-overflow: ellipsis;
  background: #0f172ae6;
  border: 1px solid #7dd3fc80;
  max-width: min(280px, 100vw - 24px);
  animation: none;
  overflow: hidden;
}
/* When the hover panel is open it occupies the space directly above the
   sprite; lift bubbles clear of it so neither clips the other. */
.whale-float.has-panel .whale-bubble {
  bottom: calc(100% + 96px);
}
@keyframes whale-bubble-pop {
  0% { opacity: 0; transform: translateY(6px) scale(0.85); }
  15% { opacity: 1; transform: translateY(0) scale(1.05); }
  25% { transform: translateY(0) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-8px) scale(0.95); }
}
.whale-panel {
  color: #e2e8f0;
  backdrop-filter: blur(6px);
  background: #0f172aeb;
  border: 1px solid #94a3b859;
  border-radius: 10px;
  flex-direction: column;
  gap: 6px;
  min-width: 148px;
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  position: absolute;
  bottom: calc(100% + 4px);
  box-shadow: 0 4px 16px #00000059;
  z-index: 10;
}
.whale-panel::after {
  content: "";
  height: 14px;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
}
.whale-rank-row {
  white-space: nowrap;
  justify-content: space-between;
  gap: 10px;
  display: flex;
}
.whale-name-cell {
  font-weight: 600;
}
.whale-rename-row {
  align-items: center;
  gap: 6px;
  display: flex;
}
.whale-name-input {
  color: #e2e8f0;
  background: #1e293be6;
  border: 1px solid #7dd3fc80;
  border-radius: 6px;
  outline: none;
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  font-size: 12px;
}
.whale-name-input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px #38bdf8;
}
.whale-actions {
  gap: 6px;
  display: flex;
}
.whale-action {
  cursor: pointer;
  color: #0f172a;
  background: linear-gradient(#7dd3fc, #38bdf8);
  border: none;
  border-radius: 6px;
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  transition: filter 0.12s, box-shadow 0.12s;
}
.whale-action:hover {
  filter: brightness(1.08);
}
.whale-action:active {
  filter: brightness(0.94);
}
.whale-action:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #38bdf8d9;
}
@media (prefers-reduced-motion: reduce) {
  .whale-bubble { opacity: 1; animation: none; }
  .whale-action { transition: none; }
}
`;
