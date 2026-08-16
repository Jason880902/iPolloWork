---
name: lark-cli
description: 用 lark-cli 查询和处理飞书/Feishu 的待办、日程、消息、审批等。当用户询问飞书相关事项（待办、日程、消息、审批）时使用。
---

# lark-cli（飞书）

lark-cli 是飞书官方 CLI，已登录用户身份可用。登录态由 lark-cli 自己管理，日常使用无需重复授权。

## 登录（一次性）

```bash
# 1. 自动创建应用（浏览器验证，无需手动去控制台）
lark-cli config init --new

# 2. 用户身份授权（设备流，可在飞书桌面客户端/浏览器完成）
lark-cli auth login --domain task,calendar,im,approval
```

`lark-cli auth status` 查看登录状态；失效时重新执行 `lark-cli auth login`。

## 常用命令

先查命令：`lark-cli <domain> --help`；用 `--jq <expr>` 过滤 JSON 输出。

- 待办：
  `lark-cli task task list --user-id me` 或 `lark-cli task --help` 查具体子命令
- 日程：
  `lark-cli calendar +agenda`（今日/本周日程）
- 消息/群聊：
  `lark-cli im message list ...`（先 `lark-cli im --help` 查子命令）
- 审批：
  `lark-cli approval --help` 查实例/任务查询

## 规则

- 输出默认 JSON；加 `--jq` 精简。
- 未知子命令先用对应 domain 的 `--help` 查证，不猜测参数。
- 读操作为主；写操作（创建待办/发消息等）需用户确认后执行。
