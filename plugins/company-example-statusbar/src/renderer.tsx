import type { PluginModule } from "@termco/kernel";
import type {
  UiStatusbarItemContribution,
  UiStatusbarItemRegistry,
  UiStatusbarRootSlots,
} from "@termco/ui-statusbar-base";
import { UI_STATUSBAR_ITEMS_SERVICE } from "@termco/ui-statusbar-base";

export function CompanyStatusbar({
  leftItems,
  rightItems,
}: UiStatusbarRootSlots) {
  return (
    <footer
      data-testid="company-example-statusbar"
      className="flex h-[22px] shrink-0 items-center border-t border-border/60 bg-background px-2 text-[11px] text-muted-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{leftItems}</div>
      <span className="font-medium text-foreground">Example Company</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {rightItems}
      </div>
    </footer>
  );
}

const plugin: PluginModule = {
  inject: [UI_STATUSBAR_ITEMS_SERVICE],
  async activate(context) {
    const contribution: UiStatusbarItemContribution = {
      id: "default-statusbar",
      label: "Example Company status bar",
      description: "Company-branded footer with public extension slots.",
      side: "root",
      order: 0,
      Component: CompanyStatusbar,
    };
    await context.effect(() =>
      context
        .get<UiStatusbarItemRegistry>("ui.statusbar.items")
        .register(contribution, {
          pluginId: "company-example-statusbar",
          generation: context.generation,
          key: contribution.id,
        }),
    );
  },
};

export default plugin;
