import { contextBridge, ipcRenderer } from "electron";

let latestBubble = null;
let bubbleCallback = null;
let chatReplyCallback = null;

ipcRenderer.on("ipollowork:pet:bubble", (_event, bubble) => {
  latestBubble = bubble;
  bubbleCallback?.(bubble);
});

ipcRenderer.on("ipollowork:pet:chat-reply", (_event, payload) => {
  chatReplyCallback?.(payload);
});

contextBridge.exposeInMainWorld("__IPOLLOWORK_PET__", {
  ready() {
    ipcRenderer.send("ipollowork:pet:ready");
  },
  onBubble(callback) {
    bubbleCallback = callback;
    if (latestBubble) {
      callback(latestBubble);
    }
    return () => {
      if (bubbleCallback === callback) {
        bubbleCallback = null;
      }
    };
  },
  setInteractive(interactive) {
    ipcRenderer.send("ipollowork:pet:set-interactive", { interactive: Boolean(interactive) });
  },
  dragStart() {
    ipcRenderer.send("ipollowork:pet:drag-start");
  },
  dragEnd() {
    ipcRenderer.send("ipollowork:pet:drag-end");
  },
  openSettings() {
    ipcRenderer.send("ipollowork:pet:open-settings");
  },
  chat(message) {
    ipcRenderer.send("ipollowork:pet:chat", message);
  },
  focusWindow() {
    ipcRenderer.send("ipollowork:pet:focus");
  },
  onChatReply(callback) {
    chatReplyCallback = callback;
    return () => {
      if (chatReplyCallback === callback) {
        chatReplyCallback = null;
      }
    };
  },
});
