import type {
  ApplicationBrandingCapability,
  ApplicationInfo,
  ApplicationInfoCapability,
  ApplicationUpdateStateCapability,
} from "@termco/application-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import {
  GithubIcon,
  Globe02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { buildLabel, REPOSITORY_URL, WEBSITE_URL } from "./model";
import {
  APPLICATION_BRANDING_SERVICE,
  APPLICATION_INFO_SERVICE,
  APPLICATION_UPDATE_STATE_SERVICE,
} from "@termco/application-base";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";

const { useEffect, useState, useSyncExternalStore } = ui.React;

function aboutHeading(info: ApplicationInfo | null): string {
  if (!info) return "Termco";
  return info.name === "Termco" ? "Electron" : info.name;
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
      {children}
    </div>
  );
}

function AboutRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-border/60 px-[15px] py-[11px] first:border-t-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LinkValue({
  icon,
  label,
  onClick,
}: {
  icon: typeof GithubIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:text-primary hover:underline"
    >
      <HugeiconsIcon
        icon={icon}
        size={13}
        strokeWidth={1.7}
        className="text-muted-foreground"
      />
      {label}
    </button>
  );
}

function UpdateActions({
  updates,
  desktop,
}: {
  updates: ApplicationUpdateStateCapability;
  desktop: DesktopIntegrationCapability;
}) {
  const status = useSyncExternalStore(
    updates.subscribe,
    updates.snapshot,
    updates.snapshot,
  );
  const checking = status.kind === "checking";
  const downloading = status.kind === "downloading";
  const available = status.kind === "available";
  const manualAvailable = status.kind === "manual-available";
  const ready = status.kind === "ready";
  const label =
    status.kind === "uptodate"
      ? "You're up to date"
      : status.kind === "error"
        ? "Check failed — retry"
        : checking
          ? "Checking…"
          : downloading
            ? "Downloading…"
            : ready
              ? "Restart to install"
              : available
                ? `Install v${status.update.version}`
                : manualAvailable
                  ? `Update to v${status.info.version}`
                  : "Check for updates";
  const update = () => {
    if (available) void updates.install();
    else void updates.check({ manual: true });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <ui.Button
          size="sm"
          onClick={update}
          disabled={checking || downloading || ready}
        >
          {label}
        </ui.Button>
        <ui.Button
          variant="outline"
          size="sm"
          onClick={() => void desktop.openUrl(REPOSITORY_URL)}
          className="gap-1.5"
        >
          <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={1.75} />
          View on GitHub
        </ui.Button>
        <ui.Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void desktop.openUrl(`${REPOSITORY_URL}/issues/new`)
          }
        >
          Report an issue
        </ui.Button>
      </div>
      {status.kind === "error" ? (
        <p className="font-mono text-xs break-all text-destructive/80">
          {status.message}
        </p>
      ) : null}
      {downloading && status.contentLength ? (
        <p className="text-xs text-muted-foreground">
          {Math.min(
            100,
            Math.round((status.downloaded / status.contentLength) * 100),
          )}
          %
        </p>
      ) : null}
    </div>
  );
}

export function createAboutSection(input: {
  application: ApplicationInfoCapability;
  updates: ApplicationUpdateStateCapability;
  desktop: DesktopIntegrationCapability;
  branding: ApplicationBrandingCapability;
}) {
  return function AboutSection() {
    const [info, setInfo] = useState<ApplicationInfo | null>(null);

    useEffect(() => {
      let active = true;
      void input.application.getInfo().then(
        (value) => {
          if (active) setInfo(value);
        },
        () => {},
      );
      return () => {
        active = false;
      };
    }, []);

    return (
      <div
        data-testid="about-section"
        className="flex flex-col items-center gap-6 pt-3"
      >
        <div className="flex flex-col items-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <img
              src={input.branding.logoUrl}
              alt=""
              className="size-9"
              draggable={false}
            />
          </div>
          <span className="mt-4 text-base font-bold">
            {aboutHeading(info)}
          </span>
          <span className="mt-0.5 font-mono text-sm text-muted-foreground">
            v{info?.version || "—"}
          </span>
          <p className="mt-3.5 max-w-[360px] text-center text-sm leading-relaxed text-muted-foreground">
            The terminal that codes with you — an open-source, AI-native
            workspace for the command line.
          </p>
        </div>

        <SettingsCard>
          <AboutRow label="Build">
            <span className="font-mono text-xs text-foreground/80">
              {info ? buildLabel(info) : "v—"}
            </span>
          </AboutRow>
          <AboutRow label="Bundle ID">
            <span className="font-mono text-xs text-foreground/80">
              {info?.bundleId ?? "app.termco"}
            </span>
          </AboutRow>
          <AboutRow label="License">
            <span className="text-xs">Apache 2.0</span>
          </AboutRow>
          <AboutRow label="Source">
            <LinkValue
              icon={GithubIcon}
              label="termco-ai/termco"
              onClick={() => void input.desktop.openUrl(REPOSITORY_URL)}
            />
          </AboutRow>
          <AboutRow label="Website">
            <LinkValue
              icon={Globe02Icon}
              label="termco.app"
              onClick={() => void input.desktop.openUrl(WEBSITE_URL)}
            />
          </AboutRow>
        </SettingsCard>

        <UpdateActions updates={input.updates} desktop={input.desktop} />
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    DESKTOP_INTEGRATION_SERVICE,
    APPLICATION_INFO_SERVICE,
    APPLICATION_BRANDING_SERVICE,
    APPLICATION_UPDATE_STATE_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const desktop = context.get<DesktopIntegrationCapability>(
      "desktop.integration",
    );
    const contribution: UiSettingsSectionContribution = {
      id: "about",
      label: "About",
      description: "Version, updates, and credits.",
      category: "",
      order: 70,
      icon: InformationCircleIcon,
      Component: createAboutSection({
        application:
          context.get<ApplicationInfoCapability>("application.info"),
        updates:
          context.get<ApplicationUpdateStateCapability>(
            "application.update-state",
          ),
        desktop,
        branding: context.get<ApplicationBrandingCapability>(
          APPLICATION_BRANDING_SERVICE,
        ),
      }),
      searchEntries: [
        {
          title: "About Termco",
          description: "Version, updates, and credits",
          keywords: "update version license",
        },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "about-native", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
