/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextInput } from "../../design-system/text-input";
import { t } from "@/i18n";

export type McpEnvModalProps = {
  open: boolean;
  serverName: string;
  missing: string[];
  saving: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
};

export function McpEnvModal(props: McpEnvModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (props.open) setValues({});
  }, [props.open, props.serverName]);

  const complete = props.missing.every((key) => (values[key] ?? "").trim().length > 0);

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("mcp.env_modal_title", { name: props.serverName })}</DialogTitle>
          <DialogDescription>{t("mcp.env_modal_desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {props.missing.map((key) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{key}</span>
              <TextInput
                type="password"
                autoComplete="off"
                value={values[key] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                placeholder={t("mcp.env_modal_placeholder")}
              />
            </label>
          ))}
          {props.error ? <p className="text-[12px] text-red-500">{props.error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={props.saving}>
            {t("mcp.env_modal_cancel")}
          </Button>
          <Button disabled={!complete || props.saving} onClick={() => void props.onSubmit(values)}>
            {props.saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {t("mcp.env_modal_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
