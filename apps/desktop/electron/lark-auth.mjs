// apps/desktop/electron/lark-auth.mjs
// 飞书（lark-cli）授权引导
// - getLarkAuthStatus(): 查询 lark-cli 授权状态
// - startLarkAuth(): 后台启动 `lark-cli config init --new`，捕获设备流浏览器授权链接
// 安全约束：本模块不读取、不保存、不输出任何 token/secret；登录态由 lark-cli 自行管理。

import { execFile, spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LARK_CLI = "lark-cli";
const STATUS_TIMEOUT_MS = 8000;
const START_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 4 * 1024 * 1024;

// lark-cli 设备流授权时打印的浏览器验证链接
const VERIFY_URL_RE = /https:\/\/open\.feishu\.cn\/page\/cli[^\s"'\\]*/;

// 探测 lark-cli 二进制：先查用户目录常见安装位置，最后回退为裸命令名（由系统按 PATH 解析）。
// 返回可直接交给 spawn/execFile 的路径。
export async function resolveLarkCliPath() {
  const home = homedir();
  const candidates = [
    join(home, ".hermes", "node", "bin", LARK_CLI),
    join(home, ".local", "bin", LARK_CLI),
    join(home, ".npm-global", "bin", LARK_CLI),
  ];
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, "npm", LARK_CLI));
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 该位置不存在，继续探测下一个
    }
  }
  return LARK_CLI;
}

// 把 child_process 错误转成可读的中文 message
function toReadableMessage(error) {
  if (error && error.code === "ENOENT") {
    return "未检测到 lark-cli，请先安装 lark-cli（如：npm install -g lark-cli）后重试";
  }
  if (error && (error.killed === true || /ETIMEDOUT|timed out/i.test(String((error && error.message) || "")))) {
    return `lark-cli 命令执行超时（${STATUS_TIMEOUT_MS / 1000}s）`;
  }
  const detail = String((error && error.message) || error || "未知错误");
  return `lark-cli 执行失败：${detail}`;
}

// 解析 `lark-cli auth status` 的输出（优先 JSON，兼容非 JSON 文本）
function parseAuthStatusOutput(stdout, stderr) {
  const text = [stdout, stderr].filter(Boolean).join("\n");
  let authenticated = false;
  let configured = true; // 命令正常返回即视为已有配置；出现异常关键词时置回 false
  try {
    const parsed = JSON.parse(String(stdout || "").trim());
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.authenticated === "boolean") authenticated = parsed.authenticated;
      if (typeof parsed.isAuthenticated === "boolean") authenticated = parsed.isAuthenticated;
      if (typeof parsed.configured === "boolean") configured = parsed.configured;
    }
  } catch {
    // 非 JSON 输出：退化为文本扫描
    const match = String(text).match(/["']?(?:authenticated|isAuthenticated|logged_in|loggedIn)["']?\s*[:=]\s*(true|false)/i);
    if (match) authenticated = match[1].toLowerCase() === "true";
  }
  if (/not configured|no config|config not found|尚未配置|未配置|缺少配置/i.test(String(text))) {
    configured = false;
  }
  return { configured, authenticated };
}

// 运行 lark-cli（execFile + 超时 + maxBuffer），失败时抛出带可读 message 的 Error
async function runLarkCli(args) {
  const bin = await resolveLarkCliPath();
  try {
    return await execFileAsync(bin, args, {
      timeout: STATUS_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      encoding: "utf8",
    });
  } catch (error) {
    const readable = new Error(toReadableMessage(error));
    readable.code = (error && error.code) || undefined;
    if (error && (error.stdout || error.stderr)) {
      readable.stdout = error.stdout ?? "";
      readable.stderr = error.stderr ?? "";
    }
    throw readable;
  }
}

// 查询 lark-cli 授权状态 → LarkAuthStatusResult
export async function getLarkAuthStatus() {
  let stdout = "";
  let stderr = "";
  try {
    // lark-cli 未配置时 `auth status` 会非零退出但输出结构化 JSON；把退出码当作
    // 响应的一部分，解析其 stdout/stderr 即可。
    const result = await runLarkCli(["auth", "status", "--json"]).catch((error) => {
      if (error && error.code !== "ENOENT" && (error.stdout || error.stderr)) {
        return { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
      }
      throw error;
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ok: true,
        available: false,
        configured: false,
        authenticated: false,
        hint: toReadableMessage(error),
      };
    }
    return {
      ok: false,
      available: true,
      configured: false,
      authenticated: false,
      hint: toReadableMessage(error),
    };
  }

  const { configured, authenticated } = parseAuthStatusOutput(stdout, stderr);
  const result = { ok: true, available: true, configured, authenticated };
  if (!configured) {
    result.hint = "尚未创建飞书应用配置，点击「发起授权」自动创建";
  } else if (!authenticated) {
    result.hint = "已配置但未授权，点击「发起授权」完成飞书登录";
  }
  return result;
}

// 后台启动 `lark-cli config init --new`，捕获设备流授权链接 → LarkAuthStartResult
export function startLarkAuth() {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    resolveLarkCliPath()
      .then((bin) => {
        const child = spawn(bin, ["config", "init", "--new"], {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        const timer = setTimeout(() => {
          child.kill();
          settle({
            ok: true,
            hint: `未能捕获授权链接，请在终端手动执行：${LARK_CLI} config init --new`,
          });
        }, START_TIMEOUT_MS);

        let output = "";
        const onData = (chunk) => {
          output += String(chunk || "");
          const match = output.match(VERIFY_URL_RE);
          if (match) {
            clearTimeout(timer);
            // 不 kill：让设备流在后台继续等待用户在浏览器中完成验证
            settle({ ok: true, verificationUrl: match[0] });
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (error) => {
          clearTimeout(timer);
          settle({ ok: false, hint: toReadableMessage(error) });
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          if (settled) return;
          const snippet = output.replace(/\s+/g, " ").trim().slice(0, 120);
          if (code === 0) {
            settle({
              ok: true,
              hint: `lark-cli config init 已退出（exit 0），未捕获授权链接${snippet ? `（${snippet}）` : ""}；如需授权请在终端执行：${LARK_CLI} auth login`,
            });
          } else {
            settle({
              ok: false,
              hint: `lark-cli config init 失败（exit code ${code}）${snippet ? `：${snippet}` : ""}`,
            });
          }
        });
      })
      .catch((error) => {
        settle({ ok: false, hint: toReadableMessage(error) });
      });
  });
}
