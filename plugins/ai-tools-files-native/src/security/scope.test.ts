import { expect, it } from "vitest";
import { isWithinDirectory } from "./scope";

it("compares directory boundaries without expanding POSIX names or Windows roots", () => {
  expect(isWithinDirectory("/etc/nginx/conf.d/site", "/etc/nginx")).toBe(true);
  expect(isWithinDirectory("/etc/nginx-old/site", "/etc/nginx")).toBe(false);
  expect(isWithinDirectory("/etc/nginx/../hosts", "/etc/nginx")).toBe(false);
  expect(isWithinDirectory("/etc/NGINX/site", "/etc/nginx")).toBe(false);
  expect(isWithinDirectory("/etc/nginx/private/site", "/etc/nginx\\private")).toBe(false);
  expect(isWithinDirectory("C:\\Work\\site", "c:/work")).toBe(true);
  expect(isWithinDirectory("D:\\Work\\site", "c:/work")).toBe(false);
  expect(isWithinDirectory("\\\\server\\share\\site", "\\\\SERVER\\share")).toBe(true);
  expect(isWithinDirectory("\\\\other\\share\\site", "\\\\server\\share")).toBe(false);
});
