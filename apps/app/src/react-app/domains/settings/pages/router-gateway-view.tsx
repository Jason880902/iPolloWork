/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Plus, RefreshCcw, Save, Trash2, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { isDesktopRuntime } from "@/app/utils";
import {
  routerGatewayGetConfig,
  routerGatewayStatus,
  routerGatewayWriteConfig,
} from "@/app/lib/desktop";
import type { RouterGatewayStatus } from "@iPolloWork/types/desktop-ipc";
import { t } from "@/i18n";
import { SettingsNotice, SettingsStatusBadge } from "../settings-section";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemFootnote,
  LayoutSectionTitle,
} from "../settings-layout";

type ModelField = {
  name: string;
  baseURL: string;
  apiKeyEnv: string;
  apiKey: string;
  contextLimit: number;
  mergeSystem: boolean;
};

type RoutingDraft = {
  listen: { host: string; port: number };
  primary: ModelField;
  escalation: {
    enabled: boolean;
    maxCompactions: number;
    models: ModelField[];
  };
  debug: boolean;
};

const emptyModel = (): ModelField => ({
  name: "",
  baseURL: "",
  apiKeyEnv: "",
  apiKey: "",
  contextLimit: 128000,
  mergeSystem: false,
});

function parseRouting(content: string | null): RoutingDraft {
  if (!content) {
    return {
      listen: { host: "127.0.0.1", port: 18222 },
      primary: emptyModel(),
      escalation: { enabled: true, maxCompactions: 5, models: [] },
      debug: true,
    };
  }
  try {
    const stripped = content
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, ""))
      .join("\n");
    const parsed = JSON.parse(stripped);
    const primary = { ...emptyModel(), ...(parsed.primary ?? {}) };
    const escalation = parsed.escalation ?? {};
    return {
      listen: { host: "127.0.0.1", port: 18222, ...(parsed.listen ?? {}) },
      primary,
      escalation: {
        enabled: escalation.enabled !== false,
        maxCompactions: Number(escalation.maxCompactions ?? 5),
        models: Array.isArray(escalation.models)
          ? escalation.models.map((m: Partial<ModelField>) => ({ ...emptyModel(), ...m }))
          : [],
      },
      debug: parsed.debug !== false,
    };
  } catch {
    return {
      listen: { host: "127.0.0.1", port: 18222 },
      primary: emptyModel(),
      escalation: { enabled: true, maxCompactions: 5, models: [] },
      debug: true,
    };
  }
}

function serializeRouting(draft: RoutingDraft): string {
  const strip = (m: ModelField) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(m)) {
      const value = m[key as keyof ModelField];
      const emptyValue = key === "contextLimit" ? 128000 : key === "mergeSystem" ? false : "";
      if (value !== "" && value !== emptyValue && value !== undefined) {
        out[key] = value;
      }
    }
    return out;
  };
  return JSON.stringify(
    {
      $schema: "./routing.schema.json",
      listen: draft.listen,
      primary: strip(draft.primary),
      escalation: {
        enabled: draft.escalation.enabled,
        maxCompactions: draft.escalation.maxCompactions,
        models: draft.escalation.models.map(strip),
      },
      debug: draft.debug,
    },
    null,
    2
  );
}

function ModelEditor(props: {
  label: string;
  value: ModelField;
  onChange: (next: ModelField) => void;
}) {
  const set = <K extends keyof ModelField>(key: K, value: ModelField[K]) => {
    props.onChange({ ...props.value, [key]: value });
  };
  return (
    <div className="space-y-3 rounded-xl border border-gray-6 bg-gray-1/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-9">{props.label}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${props.label}-name`}>{t("settings.router_gateway.model_name")}</FieldLabel>
          <Input
            id={`${props.label}-name`}
            value={props.value.name}
            onChange={(event) => set("name", event.currentTarget.value)}
            placeholder="qwen3.5"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${props.label}-base-url`}>{t("settings.router_gateway.base_url")}</FieldLabel>
          <Input
            id={`${props.label}-base-url`}
            value={props.value.baseURL}
            onChange={(event) => set("baseURL", event.currentTarget.value)}
            placeholder="http://host:port/v1"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${props.label}-api-key-env`}>{t("settings.router_gateway.api_key_env")}</FieldLabel>
          <Input
            id={`${props.label}-api-key-env`}
            value={props.value.apiKeyEnv}
            onChange={(event) => set("apiKeyEnv", event.currentTarget.value)}
            placeholder="QWEN_API_KEY"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${props.label}-api-key`}>{t("settings.router_gateway.api_key")}</FieldLabel>
          <Input
            id={`${props.label}-api-key`}
            value={props.value.apiKey}
            onChange={(event) => set("apiKey", event.currentTarget.value)}
            placeholder={t("settings.router_gateway.api_key_optional")}
            type="password"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${props.label}-context-limit`}>{t("settings.router_gateway.context_limit")}</FieldLabel>
          <Input
            id={`${props.label}-context-limit`}
            value={String(props.value.contextLimit)}
            onChange={(event) => set("contextLimit", Number(event.currentTarget.value) || 0)}
            type="number"
          />
        </Field>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-11">
            <Switch
              checked={props.value.mergeSystem}
              onCheckedChange={(checked) => set("mergeSystem", checked)}
            />
            {t("settings.router_gateway.merge_system")}
          </label>
        </div>
      </div>
    </div>
  );
}

export function RouterGatewayView() {
  const [draft, setDraft] = useState<RoutingDraft | null>(null);
  const [status, setStatus] = useState<RouterGatewayStatus | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [config, statusResult] = await Promise.all([
        routerGatewayGetConfig(),
        routerGatewayStatus(),
      ]);
      setDraft(parseRouting(config.content));
      setConfigPath(config.path);
      setStatus(statusResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (isDesktopRuntime()) void refresh();
  }, [refresh]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const result = await routerGatewayWriteConfig(serializeRouting(draft));
      if (!result.ok) throw new Error(result.stderr || result.stdout);
      toast.success(t("settings.router_gateway.saved"));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const statusTone: "neutral" | "error" = status?.running ? "neutral" : "error";
  const statusLabel = status?.running
    ? t("settings.router_gateway.running")
    : t("settings.router_gateway.not_running");

  const updatePrimary = (next: ModelField) => {
    if (!draft) return;
    setDraft({ ...draft, primary: next });
  };

  const updateEscalationModel = (index: number, next: ModelField) => {
    if (!draft) return;
    const models = draft.escalation.models.map((m, i) => (i === index ? next : m));
    setDraft({ ...draft, escalation: { ...draft.escalation, models } });
  };

  const addEscalationModel = () => {
    if (!draft) return;
    setDraft({ ...draft, escalation: { ...draft.escalation, models: [...draft.escalation.models, emptyModel()] } });
  };

  const removeEscalationModel = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      escalation: { ...draft.escalation, models: draft.escalation.models.filter((_, i) => i !== index) },
    });
  };

  const dirty = useMemo(() => Boolean(draft), [draft]);

  if (!isDesktopRuntime()) {
    return (
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.router_gateway.title")}</LayoutSectionTitle>
        </LayoutSectionHeader>
        <LayoutSectionItem>
          <SettingsNotice tone="error">{t("settings.router_gateway.desktop_only")}</SettingsNotice>
        </LayoutSectionItem>
      </LayoutSection>
    );
  }

  return (
    <LayoutSection>
      <LayoutSectionHeader>
        <LayoutSectionTitle>
          <Workflow size={16} />
          {t("settings.router_gateway.title")}
        </LayoutSectionTitle>
        <LayoutSectionDescription>{t("settings.router_gateway.description")}</LayoutSectionDescription>
      </LayoutSectionHeader>

      <LayoutSectionItem className="gap-4">
        {/* status row */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-6 bg-gray-1/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <SettingsStatusBadge tone={statusTone} label={statusLabel} />
            {status?.running ? (
              <span className="text-xs text-gray-9">
                {t("settings.router_gateway.primary_model", { model: status.primary ?? "-" })}
              </span>
            ) : null}
            {status?.error ? <span className="text-xs text-gray-8">{status.error}</span> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCcw size={14} className={busy ? "animate-spin" : ""} />
            {t("settings.router_gateway.refresh")}
          </Button>
        </div>

        {!draft ? (
          <SettingsNotice>{t("settings.router_gateway.loading")}</SettingsNotice>
        ) : (
          <>
            {/* primary model */}
            <ModelEditor
              label={t("settings.router_gateway.primary_label")}
              value={draft.primary}
              onChange={updatePrimary}
            />

            {/* escalation */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.escalation.enabled}
                    onCheckedChange={(checked) =>
                      setDraft({ ...draft, escalation: { ...draft.escalation, enabled: checked } })
                    }
                  />
                  <span className="text-sm font-medium text-gray-12">
                    {t("settings.router_gateway.escalation_label")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Field className="w-28">
                    <FieldLabel htmlFor="router-max-compactions">
                      {t("settings.router_gateway.max_compactions")}
                    </FieldLabel>
                    <Input
                      id="router-max-compactions"
                      type="number"
                      value={String(draft.escalation.maxCompactions)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          escalation: { ...draft.escalation, maxCompactions: Number(event.currentTarget.value) || 0 },
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.router_gateway.escalation_desc")}</p>

              <div className="space-y-3">
                {draft.escalation.models.map((model, index) => (
                  <div key={index} className="relative space-y-2">
                    <ModelEditor
                      label={t("settings.router_gateway.escalation_model", { index: index + 1 })}
                      value={model}
                      onChange={(next) => updateEscalationModel(index, next)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-11"
                      onClick={() => removeEscalationModel(index)}
                    >
                      <Trash2 size={14} />
                      {t("settings.router_gateway.remove_model")}
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addEscalationModel}>
                  <Plus size={14} />
                  {t("settings.router_gateway.add_model")}
                </Button>
              </div>
            </div>

            {/* debug + save */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-6 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-11">
                <Switch
                  checked={draft.debug}
                  onCheckedChange={(checked) => setDraft({ ...draft, debug: checked })}
                />
                {t("settings.router_gateway.debug")}
              </label>
              <Button type="button" onClick={() => void save()} disabled={saving || !dirty}>
                <Save size={14} />
                {saving ? t("settings.router_gateway.saving") : t("common.save")}
              </Button>
            </div>

            {configPath ? (
              <LayoutSectionItemFootnote>
                {t("settings.router_gateway.config_path", { path: configPath })}
              </LayoutSectionItemFootnote>
            ) : null}
          </>
        )}
      </LayoutSectionItem>
    </LayoutSection>
  );
}
