/** @jsxImportSource react */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  larkAuthStart,
  larkAuthStatus,
  openDesktopUrl,
  petGetConfig,
  petGetIntegrations,
  petGetState,
  petSetAutoCheck,
  petSetConfig,
  petSetEnabled,
} from "@/app/lib/desktop";
import type { LarkAuthStatusResult } from "@ipollowork/types/desktop-ipc";
import { isDesktopRuntime } from "@/app/utils";
import { t } from "@/i18n";
import { PET_NAME_MAX_LENGTH } from "../../../../pet/whale-contract";
import { PET_TEMPLATES } from "../../../kernel/pet-templates";
import {
  PET_PERSONA_PROMPT,
  PET_PERSONA_STORAGE_KEY,
} from "../../../kernel/pet-persona";
import { fetchPetEngineProviders } from "../../../kernel/pet-engine";
import { useLocal } from "../../../kernel/local-provider";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
  LayoutStack,
} from "../settings-layout";

export function PetView({ onOpenProviderAuth, onOpenExtensions }: {
  onOpenProviderAuth: () => void;
  onOpenExtensions: () => void;
}) {
  const local = useLocal();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [persona, setPersona] = useState(PET_PERSONA_PROMPT);
  const [personaSaved, setPersonaSaved] = useState(false);
  const [autoCheck, setAutoCheck] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [nicknameSaved, setNicknameSaved] = useState(false);
  const [larkStatus, setLarkStatus] = useState<LarkAuthStatusResult | null>(null);
  const [larkBusy, setLarkBusy] = useState(false);
  const [larkMessage, setLarkMessage] = useState<string | null>(null);

  const refreshLarkStatus = async () => {
    setLarkBusy(true);
    try {
      const result = await larkAuthStatus();
      setLarkStatus(result);
      setLarkMessage(result.hint ?? null);
    } catch (error) {
      setLarkMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLarkBusy(false);
    }
  };

  const startLarkAuth = async () => {
    setLarkBusy(true);
    try {
      const result = await larkAuthStart();
      if (result.ok && result.verificationUrl) {
        try {
          await navigator.clipboard.writeText(result.verificationUrl);
          setLarkMessage(t("settings.pet.lark_copied"));
        } catch {
          setLarkMessage(result.verificationUrl);
        }
        void openDesktopUrl(result.verificationUrl).catch(() => undefined);
      } else {
        setLarkMessage(result.hint ?? "");
      }
    } catch (error) {
      setLarkMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLarkBusy(false);
    }
  };

  useEffect(() => {
    void refreshLarkStatus();
  }, []);

  useEffect(() => {
    const refreshModelLabel = () => {
      void fetchPetEngineProviders()
        .then((providers) => {
          // "opencode" is the bundled fallback provider; a user-connected
          // provider should replace the fallback label once connected.
          const connected = providers.filter((provider) => provider.id && provider.id !== "opencode");
          const preferred = local.prefs.defaultModel;
          if (preferred && connected.some((provider) => provider.id === preferred.providerID)) {
            setModelLabel(`${preferred.providerID} / ${preferred.modelID}`);
          } else if (connected.length > 0) {
            const first = connected[0];
            setModelLabel(`${first.name ?? first.id}${t("settings.pet.ai_model_connected_suffix")}`);
          } else if (preferred) {
            setModelLabel(`${preferred.providerID} / ${preferred.modelID}`);
          } else {
            setModelLabel(null);
          }
        })
        .catch(() => undefined);
    };
    refreshModelLabel();
    window.addEventListener("focus", refreshModelLabel);
    // The provider modal closes without a window-focus event, so poll while
    // the page is visible to reflect a freshly saved model right away.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refreshModelLabel();
    }, 2_000);
    return () => {
      window.removeEventListener("focus", refreshModelLabel);
      clearInterval(poll);
    };
  }, [local.prefs.defaultModel]);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setEnabled(false);
      return;
    }
    void petGetState()
      .then((state) => setEnabled(state.enabled))
      .catch(() => setEnabled(false));
    void petGetIntegrations()
      .then((state) => setAutoCheck(state.autoCheck))
      .catch(() => undefined);
    void petGetConfig()
      .then((config) => {
        setTemplateId(config.templateId);
        setNickname(config.nickname);
      })
      .catch(() => undefined);
    try {
      const custom = window.localStorage.getItem(PET_PERSONA_STORAGE_KEY)?.trim();
      if (custom) setPersona(custom);
    } catch {
      // ignore
    }
  }, []);

  const toggleEnabled = (next: boolean) => {
    setBusy(true);
    void petSetEnabled({ enabled: next })
      .then((state) => setEnabled(state.enabled))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const savePersona = () => {
    try {
      const trimmed = persona.trim();
      if (trimmed && trimmed !== PET_PERSONA_PROMPT) {
        window.localStorage.setItem(PET_PERSONA_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(PET_PERSONA_STORAGE_KEY);
      }
      setPersonaSaved(true);
      setTimeout(() => setPersonaSaved(false), 2000);
    } catch {
      // ignore
    }
  };

  const flashSaved = () => {
    setNicknameSaved(true);
    setTimeout(() => setNicknameSaved(false), 2000);
  };

  const saveNickname = (value: string) => {
    const trimmed = value.trim();
    void petSetConfig({ ...(trimmed ? { nickname: trimmed } : { nickname: "" }) })
      .then((result) => {
        if (result.ok) setNickname(result.nickname);
      })
      .catch(() => undefined);
    flashSaved();
  };

  const switchTemplate = (next: string) => {
    setTemplateId(next);
    void petSetConfig({ templateId: next }).catch(() => undefined);
  };

  return (
    <LayoutStack>
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.pet.title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.pet.section_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.pet.enabled")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.pet.enabled_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("settings.pet.enabled")}
                checked={enabled === true}
                disabled={busy || enabled === null || !isDesktopRuntime()}
                onCheckedChange={toggleEnabled}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.pet.nickname")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.pet.nickname_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("settings.pet.nickname")}
                  value={nickname}
                  maxLength={PET_NAME_MAX_LENGTH}
                  placeholder={t("settings.pet.nickname_placeholder")}
                  className="w-40 text-[13px]"
                  onChange={(event) => setNickname(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      saveNickname(nickname);
                    } else if (event.key === "Escape") {
                      void petGetConfig().then((config) => setNickname(config.nickname)).catch(() => undefined);
                    }
                  }}
                  onBlur={() => saveNickname(nickname)}
                />
                <span className="text-[12px] text-emerald-500">{nicknameSaved ? t("settings.pet.config_saved") : ""}</span>
              </div>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>

        <div className="flex flex-col gap-2 px-4 pb-4">
          <div>
            <div className="text-[13px] font-medium">{t("settings.pet.appearance_title")}</div>
            <div className="text-[12px] text-slate-400">{t("settings.pet.appearance_desc")}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PET_TEMPLATES.map((template) => {
              const selected = templateId === template.id || (templateId === null && template.id === "whale-girl");
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => switchTemplate(template.id)}
                  className={`group flex flex-col items-stretch overflow-hidden rounded-xl border text-left transition-colors ${
                    selected
                      ? "border-indigo-500 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-500/60"
                  }`}
                >
                  <div className="flex h-36 items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
                    {template.kind === "spritesheet" ? (
                      <img src={template.previewUrl} alt={template.defaultName} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <img
                        src={template.previewUrl}
                        alt={template.defaultName}
                        className="max-h-full max-w-full object-contain"
                        style={{ background: "linear-gradient(180deg,#f1f5f9,#e2e8f0)" }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">{template.defaultName}</span>
                      {selected ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] text-white">
                          ✓
                        </span>
                      ) : null}
                    </div>
                    <span className="line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      {template.tagline}
                    </span>
                    <span className="mt-1 w-fit rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {template.activityAnimation
                        ? t("settings.pet.template_activity")
                        : t("settings.pet.template_no_activity")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.pet.ai_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.pet.ai_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              {modelLabel ?? t("settings.pet.ai_model_none")}
            </LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.pet.ai_model_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button size="sm" variant="outline" onClick={onOpenProviderAuth}>
                {t("settings.pet.ai_configure")}
              </Button>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.pet.integrations_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.pet.integrations_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.pet.mcp_title")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.pet.mcp_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenExtensions}
              >
                {t("settings.pet.mcp_configure")}
              </Button>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.pet.lark_title")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>
              {!larkStatus
                ? t("settings.pet.lark_status_unknown")
                : !larkStatus.available
                  ? t("settings.pet.lark_status_unavailable")
                  : !larkStatus.configured
                    ? t("settings.pet.lark_status_unconfigured")
                    : !larkStatus.authenticated
                      ? t("settings.pet.lark_status_configured")
                      : t("settings.pet.lark_status_authenticated")}
              {larkMessage ? ` · ${larkMessage}` : ""}
            </LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Button size="sm" variant="outline" disabled={larkBusy} onClick={() => void startLarkAuth()}>
                {t("settings.pet.lark_start_auth")}
              </Button>
              <Button size="sm" variant="ghost" disabled={larkBusy} onClick={() => void refreshLarkStatus()}>
                {t("settings.pet.lark_refresh")}
              </Button>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.pet.auto_check")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.pet.auto_check_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("settings.pet.auto_check")}
                checked={autoCheck === true}
                disabled={autoCheck === null || !isDesktopRuntime()}
                onCheckedChange={(next) => {
                  setAutoCheck(next);
                  void petSetAutoCheck({ enabled: next })
                    .then((result) => {
                      if (result.ok) setAutoCheck(result.state.autoCheck);
                    })
                    .catch(() => setAutoCheck((current) => current));
                }}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.pet.persona_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.pet.persona_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Textarea
            aria-label={t("settings.pet.persona_title")}
            value={persona}
            onChange={(event) => setPersona(event.target.value)}
            rows={6}
            className="text-[13px]"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={savePersona}>
              {personaSaved ? t("settings.pet.persona_saved") : t("settings.pet.persona_save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPersona(PET_PERSONA_PROMPT);
                try {
                  window.localStorage.removeItem(PET_PERSONA_STORAGE_KEY);
                } catch {
                  // ignore
                }
              }}
            >
              {t("settings.pet.persona_reset")}
            </Button>
          </div>
        </div>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.pet.tasks_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.pet.tasks_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>
      </LayoutSection>
    </LayoutStack>
  );
}
