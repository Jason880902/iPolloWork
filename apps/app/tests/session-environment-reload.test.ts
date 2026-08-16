import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sessionRouteSource = readFileSync(
  new URL("../src/react-app/shell/session-route.tsx", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

describe("session environment changes", () => {
  test("restarts the worker so newly saved environment credentials reach model processes", () => {
    const applyChanges = sessionRouteSource.match(
      /const handleApplyEnvironmentChanges = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/,
    )?.[1] ?? "";

    expect(applyChanges).toContain("engineRestart({})");
    expect(applyChanges).toContain("ensureDesktopLocaliPolloWorkConnection");
  });
});
