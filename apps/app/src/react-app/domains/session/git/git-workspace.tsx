/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";
import { Download, GitBranch, Loader2, Plus, Upload, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type GitStatusData = {
  ok: boolean;
  branch?: string | null;
  staged?: string[];
  unstaged?: string[];
  untracked?: string[];
  conflicted?: string[];
  error?: string;
};

type GitBranchesData = {
  ok: boolean;
  branches?: { name: string; current: boolean }[];
  current?: string | null;
  error?: string;
};

type GitBridge = NonNullable<NonNullable<typeof window.__IPOLLOWORK_ELECTRON__>["git"]>;

type GitWorkspaceProps = {
  workspaceRoot: string;
  onChanged?: () => void;
};

export function GitWorkspace({ workspaceRoot, onChanged }: GitWorkspaceProps) {
  const bridge = typeof window !== "undefined" ? window.__IPOLLOWORK_ELECTRON__?.git : undefined;
  const [status, setStatus] = useState<GitStatusData | null>(null);
  const [branchesData, setBranchesData] = useState<GitBranchesData | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ file: string; staged: boolean; text: string } | null>(null);
  const [confirmPush, setConfirmPush] = useState(false);

  const refresh = useCallback(async () => {
    if (!bridge?.status) return;
    const s = await bridge.status({ cwd: workspaceRoot });
    setStatus(s);
    if (bridge.branches) {
      const b = await bridge.branches({ cwd: workspaceRoot });
      setBranchesData(b);
    }
  }, [bridge, workspaceRoot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
      if (!bridge) return;
      setBusy(key);
      setNotice(null);
      try {
        const result = await fn();
        if (!result.ok) setNotice(result.error ?? "操作失败");
        await refresh();
        onChanged?.();
      } finally {
        setBusy(null);
      }
    },
    [bridge, refresh, onChanged],
  );

  if (!bridge) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        Git 操作仅在桌面应用可用。
      </div>
    );
  }

  const git = bridge as GitBridge;
  const staged = status?.staged ?? [];
  const unstaged = status?.unstaged ?? [];
  const untracked = status?.untracked ?? [];
  const conflicted = status?.conflicted ?? [];

  const showDiff = async (file: string, stagedFlag: boolean) => {
    if (!git.diff) return;
    const r = await git.diff({ cwd: workspaceRoot, staged: stagedFlag, file });
    if (r.ok) setDiff({ file, staged: stagedFlag, text: r.diff });
  };

  const doCommit = () =>
    run("commit", async () => {
      const r = await git.commit!({ cwd: workspaceRoot, message });
      if (r.ok) setMessage("");
      return r;
    });

  const doCreateBranch = () =>
    run("create-branch", async () => {
      const r = await git.createBranch!({ cwd: workspaceRoot, name: newBranch });
      if (r.ok) setNewBranch("");
      return r;
    });

  const doPush = () => run("push", () => git.push!({ cwd: workspaceRoot }));
  const doPull = () => run("pull", () => git.pull!({ cwd: workspaceRoot }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 分支区 */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 shrink-0 text-muted-foreground" />
          <Select value={branchesData?.current ?? ""} onValueChange={(value) => value && void run("checkout", () => git.checkout!({ cwd: workspaceRoot, branch: value }))}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="选择分支" />
            </SelectTrigger>
            <SelectContent>
              {(branchesData?.branches ?? []).map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder="新建分支名"
            className="h-8"
          />
          <Button variant="outline" size="sm" disabled={!newBranch.trim() || busy === "create-branch"} onClick={() => void doCreateBranch()}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 状态 + 提交 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {notice ? <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{notice}</p> : null}

        {conflicted.length > 0 ? (
          <FileGroup title="冲突" files={conflicted} badge="destructive" />
        ) : null}

        <FileGroup
          title="未暂存"
          files={unstaged}
          actionLabel="暂存"
          onAction={(files) => void run("stage", () => git.stage!({ cwd: workspaceRoot, files }))}
          onFileClick={(f) => void showDiff(f, false)}
          busy={busy === "stage"}
        />
        <FileGroup
          title="未跟踪"
          files={untracked}
          actionLabel="暂存"
          onAction={(files) => void run("stage", () => git.stage!({ cwd: workspaceRoot, files }))}
          onFileClick={(f) => void showDiff(f, false)}
          busy={busy === "stage"}
        />
        <FileGroup
          title="已暂存"
          files={staged}
          actionLabel="取消暂存"
          onAction={(files) => void run("unstage", () => git.unstage!({ cwd: workspaceRoot, files }))}
          onFileClick={(f) => void showDiff(f, true)}
          busy={busy === "unstage"}
        />

        {staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicted.length === 0 ? (
          <p className="text-xs text-muted-foreground">工作区干净，没有变更。</p>
        ) : null}

        {diff ? (
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <span className="truncate font-mono text-xs">
                {diff.file}
                <span className="ml-1 text-muted-foreground">({diff.staged ? "已暂存" : "未暂存"})</span>
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="关闭 diff" onClick={() => setDiff(null)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto p-2 font-mono text-[11px] leading-5 text-muted-foreground">{diff.text || "（无差异）"}</pre>
          </div>
        ) : null}
      </div>

      {/* 提交 + 同步 */}
      <div className="space-y-2 border-t border-border p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="提交信息"
          className="h-8"
          onKeyDown={(e) => {
            if (e.key === "Enter" && message.trim() && staged.length > 0) void doCommit();
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            disabled={!message.trim() || staged.length === 0 || busy === "commit"}
            onClick={() => void doCommit()}
          >
            {busy === "commit" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>提交{staged.length > 0 ? ` (${staged.length})` : ""}</span>
          </Button>
          <Button variant="outline" size="sm" disabled={busy === "pull"} onClick={() => void doPull()} title="拉取">
            {busy === "pull" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          </Button>
          <Button variant="outline" size="sm" disabled={busy === "push"} onClick={() => setConfirmPush(true)} title="推送">
            {busy === "push" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          </Button>
        </div>
        {staged.length === 0 && message.trim() ? (
          <p className="text-[11px] text-muted-foreground">暂存至少一个文件后才能提交。</p>
        ) : null}
      </div>

      <AlertDialog open={confirmPush} onOpenChange={setConfirmPush}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认推送</AlertDialogTitle>
            <AlertDialogDescription>
              将当前分支 {branchesData?.current ?? ""} 推送到远端仓库？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmPush(false);
                void doPush();
              }}
            >
              推送
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FileGroup({
  title,
  files,
  badge,
  actionLabel,
  onAction,
  onFileClick,
  busy,
}: {
  title: string;
  files: string[];
  badge?: "destructive";
  actionLabel?: string;
  onAction?: (files: string[]) => void;
  onFileClick?: (file: string) => void;
  busy?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{title}</span>
          <Badge variant={badge === "destructive" ? "destructive" : "secondary"} className="px-1.5 py-0 text-[10px]">
            {files.length}
          </Badge>
        </div>
        {actionLabel && onAction ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => onAction(files)}>
            {actionLabel}全部
          </Button>
        ) : null}
      </div>
      <div className="space-y-px">
        {files.map((file) => (
          <div key={file} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60">
            <button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground" onClick={() => onFileClick?.(file)}>
              {file}
            </button>
            {actionLabel && onAction ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] opacity-0 group-hover:opacity-100" disabled={busy} onClick={() => onAction([file])}>
                {actionLabel}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
