/** @jsxImportSource react */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  petGetIntegrations,
  petGetState,
  petSetAutoCheck,
  petSetEnabled,
} from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import { t } from "@/i18n";
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
