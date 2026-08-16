import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, screen, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PET_HTML = "pet.html";
const PET_WINDOW_WIDTH = 380;
const PET_WINDOW_HEIGHT = 520;
const PET_STATE_FILE = "pet-state.json";
const PET_DRAG_POLL_MS = 16;
const PET_DEFAULT_TEMPLATE_ID = "whale-girl";
const PET_NAME_MAX_LENGTH = 20;

export function createPetWindow({ getWindow }) {
  let petWindow = null;
  let interactive = false;
  let dragState = null;

  function petStatePath() {
    return path.join(app.getPath("userData"), PET_STATE_FILE);
  }

  function normalizePetState(value) {
    if (!value || typeof value !== "object") return null;
    const enabled = Reflect.get(value, "enabled");
    const x = Number(Reflect.get(value, "x"));
    const y = Number(Reflect.get(value, "y"));
    const templateId = Reflect.get(value, "templateId");
    const nickname = Reflect.get(value, "nickname");
    return {
      enabled: typeof enabled === "boolean" ? enabled : true,
      x: Number.isFinite(x) ? Math.round(x) : null,
      y: Number.isFinite(y) ? Math.round(y) : null,
      templateId: typeof templateId === "string" && templateId.trim() !== "" ? templateId.trim() : null,
      nickname: typeof nickname === "string" && nickname.trim() !== "" ? nickname.trim().slice(0, PET_NAME_MAX_LENGTH) : null,
    };
  }

  function petPositionIsVisible(x, y) {
    return screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return x < area.x + area.width && x + PET_WINDOW_WIDTH > area.x && y < area.y + area.height && y + PET_WINDOW_HEIGHT > area.y;
    });
  }

  async function readPetState() {
    try {
      const raw = await readFile(petStatePath(), "utf8");
      const state = normalizePetState(JSON.parse(raw));
      if (!state) return null;
      if (state.x !== null && state.y !== null && !petPositionIsVisible(state.x, state.y)) {
        state.x = null;
        state.y = null;
      }
      return state;
    } catch {
      return null;
    }
  }

  async function writePetState(patch) {
    let state = normalizePetState({});
    try {
      state = normalizePetState(JSON.parse(await readFile(petStatePath(), "utf8"))) ?? state;
    } catch {
      // fall through with defaults
    }
    const next = { ...state, ...patch };
    try {
      await writeFile(petStatePath(), JSON.stringify(next), "utf8");
    } catch (error) {
      console.warn("[pet] failed to persist pet state", error);
    }
  }

  function defaultPetPosition() {
    const area = screen.getPrimaryDisplay().workArea;
    return {
      x: area.x + area.width - PET_WINDOW_WIDTH - 24,
      y: area.y + area.height - PET_WINDOW_HEIGHT - 24,
    };
  }

  function petRendererUrl() {
    const currentUrl = getWindow()?.webContents?.getURL?.();
    if (currentUrl && /^https?:\/\//i.test(currentUrl)) {
      return new URL(PET_HTML, currentUrl).toString();
    }
    return null;
  }

  async function loadPetRenderer(win) {
    const devUrl = petRendererUrl();
    if (devUrl) {
      await win.webContents.loadURL(devUrl);
      return;
    }
    const packagedPath = path.join(process.resourcesPath, "app-dist", PET_HTML);
    const devPath = path.resolve(__dirname, "../../app/dist", PET_HTML);
    await win.webContents.loadFile(app.isPackaged ? packagedPath : devPath);
  }

  function setInteractive(next) {
    const win = petWindow;
    if (!win || win.isDestroyed() || next === interactive) return;
    interactive = next;
    // Granular click-through: ignore cursor everywhere except when the
    // renderer reports it is over an interactive element.
    win.setIgnoreMouseEvents(!next, { forward: true });
  }

  function stopDrag() {
    if (!dragState) return;
    clearInterval(dragState.timer);
    dragState = null;
    const win = petWindow;
    if (win && !win.isDestroyed()) {
      const { x, y } = win.getBounds();
      void writePetState({ x, y });
    }
  }

  function startDrag() {
    const win = petWindow;
    if (!win || win.isDestroyed() || dragState) return;
    const startCursor = screen.getCursorScreenPoint();
    const startBounds = win.getBounds();
    dragState = {
      timer: setInterval(() => {
        if (!petWindow || petWindow.isDestroyed()) {
          stopDrag();
          return;
        }
        const cursor = screen.getCursorScreenPoint();
        petWindow.setPosition(
          Math.round(startBounds.x + cursor.x - startCursor.x),
          Math.round(startBounds.y + cursor.y - startCursor.y),
        );
      }, PET_DRAG_POLL_MS),
    };
  }

  async function ensureWindow() {
    if (petWindow && !petWindow.isDestroyed()) {
      return petWindow;
    }

    const state = await readPetState();
    if (state && state.enabled === false) {
      return null;
    }
    const position = state?.x !== null && state?.y !== null && state ? { x: state.x, y: state.y } : defaultPetPosition();

    const win = new BrowserWindow({
      width: PET_WINDOW_WIDTH,
      height: PET_WINDOW_HEIGHT,
      x: position.x,
      y: position.y,
      transparent: true,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      skipTaskbar: true,
      title: "iPolloWork Pet",
      webPreferences: {
        // Electron only runs ESM preload scripts reliably with sandbox disabled.
        backgroundThrottling: false,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "pet-preload.mjs"),
      },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("closed", () => {
      stopDrag();
      if (petWindow === win) {
        petWindow = null;
        interactive = false;
      }
    });

    petWindow = win;
    await loadPetRenderer(win);
    console.info(`[pet] window created at ${position.x},${position.y}`);
    return win;
  }

  function destroyWindow() {
    stopDrag();
    const win = petWindow;
    petWindow = null;
    interactive = false;
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }

  function showBubble(bubble) {
    const win = petWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("ipollowork:pet:bubble", bubble);
  }

  const ALLOWED_EXTERNAL_SCHEMES = new Set(["https:", "http:", "dingtalk:", "wxwork:"]);
  // Custom schemes are allowed only for inert navigation targets, never
  // message-send or url-proxy deep links (DSH review H3).
  const ALLOWED_CUSTOM_SCHEME_PREFIXES = ["dingtalk://", "wxwork://"];

  function handleBubbleAction(payload) {
    const action = payload && typeof payload === "object" ? payload : {};
    if (action.type === "open-session" && typeof action.sessionId === "string" && action.sessionId) {
      // Reject anything that does not look like an opencode session id.
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(action.sessionId)) return;
      const mainWin = getWindow();
      if (!mainWin || mainWin.isDestroyed()) return;
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send("ipollowork:pet:open-session", { sessionId: action.sessionId.slice(0, 64) });
      return;
    }
    if (action.type === "open-url" && typeof action.url === "string") {
      const url = action.url.slice(0, 2000);
      let protocol = null;
      try {
        protocol = new URL(url).protocol;
      } catch {
        return;
      }
      if (!protocol || !ALLOWED_EXTERNAL_SCHEMES.has(protocol)) return;
      if (protocol === "http:") return; // web links open over https only
      if (protocol === "dingtalk:" || protocol === "wxwork:") {
        if (!ALLOWED_CUSTOM_SCHEME_PREFIXES.some((prefix) => url.toLowerCase().startsWith(prefix))) return;
      }
      void shell.openExternal(url).catch(() => undefined);
    }
  }

  function sendActivity(activity) {
    const win = petWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("ipollowork:pet:activity", activity);
  }

  async function getConfig() {
    const state = await readPetState();
    return {
      templateId: state?.templateId ?? PET_DEFAULT_TEMPLATE_ID,
      nickname: state?.nickname ?? "",
    };
  }

  function broadcastConfig(config) {
    const win = petWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("ipollowork:pet:config", config);
  }

  async function setConfig(patch) {
    const next = {};
    if (typeof patch?.templateId === "string" && patch.templateId.trim() !== "") {
      next.templateId = patch.templateId.trim();
    }
    if (typeof patch?.nickname === "string") {
      // Empty string clears the nickname back to the template default.
      next.nickname = patch.nickname.trim().slice(0, PET_NAME_MAX_LENGTH) || null;
    }
    await writePetState(next);
    const config = await getConfig();
    broadcastConfig(config);
    return { ok: true, ...config };
  }

  function sendChatReply(reply) {
    const win = petWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("ipollowork:pet:chat-reply", reply);
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("ipollowork:pet:get-config", () => getConfig());
    ipcMain.on("ipollowork:pet:ready", (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      if (!win.isVisible()) {
        win.showInactive();
      }
      console.info("[pet] renderer ready, window shown");
      // Until the settings panel lands, start click-through disabled so the
      // pet can be dragged right away; the renderer opts in per hover zone.
      setInteractive(true);
    });
    ipcMain.on("ipollowork:pet:set-interactive", (event, payload) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      setInteractive(Boolean(payload?.interactive));
    });
    ipcMain.on("ipollowork:pet:drag-start", (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      startDrag();
    });
    ipcMain.on("ipollowork:pet:drag-end", (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      stopDrag();
    });
    ipcMain.on("ipollowork:pet:open-settings", async (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      const mainWin = getWindow();
      if (!mainWin) return;
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send("ipollowork:pet:open-settings");
    });
    ipcMain.on("ipollowork:pet:chat", (event, payload) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      const id = typeof payload?.id === "string" ? payload.id.slice(0, 64) : null;
      const text = typeof payload?.text === "string" ? payload.text.slice(0, 4000).trim() : "";
      if (!id || !text) return;
      const mainWin = getWindow();
      if (!mainWin || mainWin.isDestroyed()) return;
      // Relay to the main renderer, which owns the authenticated engine client.
      mainWin.webContents.send("ipollowork:pet:chat-request", { id, text });
    });
    ipcMain.on("ipollowork:pet:action", (event, payload) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      handleBubbleAction(payload);
    });
    ipcMain.on("ipollowork:pet:focus", (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      // The pet window is shown inactively, so the app never becomes key on
      // macOS; without this the chat input cannot receive keyboard focus.
      app.focus({ steal: true });
      win.focus();
    });
    ipcMain.on("ipollowork:pet:hide", (event) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      void setEnabled(false);
    });
    ipcMain.on("ipollowork:pet:set-config", (event, payload) => {
      const win = petWindow;
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      void setConfig(payload ?? {});
    });
  }

  async function getState() {
    const state = await readPetState();
    return { enabled: state?.enabled !== false };
  }

  async function setEnabled(enabled) {
    await writePetState({ enabled: Boolean(enabled) });
    if (enabled) {
      await ensureWindow();
    } else {
      destroyWindow();
    }
    return getState();
  }

  return {
    ensureWindow,
    destroyWindow,
    getState,
    setEnabled,
    getConfig,
    setConfig,
    registerIpc,
    showBubble,
    sendActivity,
    sendChatReply,
    isActive: () => Boolean(petWindow && !petWindow.isDestroyed()),
  };
}
