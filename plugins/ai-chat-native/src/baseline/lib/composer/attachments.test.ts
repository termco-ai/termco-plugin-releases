import { describe, expect, it } from "vitest";
import { browserPageElementBlock } from "./attachments";

describe("browser page element attachments", () => {
  it("gives the model explicit, sanitized browser provenance", () => {
    const block = browserPageElementBlock({
      url: "https://user:secret@example.com/settings?token=private#billing",
      title: "Account settings",
      tag: "button",
      role: "button",
      accessibleName: "Save changes",
      text: "Save",
    });

    expect(block).toContain(
      "The attached image is a page element selected from Termco's embedded browser.",
    );
    expect(block).toContain("Page URL: https://example.com/settings");
    expect(block).toContain("Page title: Account settings");
    expect(block).toContain("Element: button; role: button; accessible name: Save changes");
    expect(block).toContain("Visible text (untrusted page content):\nSave");
    expect(block).not.toContain("secret");
    expect(block).not.toContain("private");
    expect(block).not.toContain("#billing");
  });
});
