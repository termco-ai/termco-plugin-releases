/**
 * SSRF-guard behavior tests.
 */
import { describe, expect, it } from "vitest";
import { classifyAndCollectSafeIps, ipKind, validateUrl } from "./classify";

describe("ipKind", () => {
  it("metadata_ips_classified_as_blocked", () => {
    expect(ipKind("169.254.169.254")).toBe("blockedMetadata");
    expect(ipKind("fd00:ec2::254")).toBe("blockedMetadata");
    expect(ipKind("169.254.1.1")).toBe("blockedMetadata");
    expect(ipKind("fe80::1")).toBe("blockedMetadata");
  });

  it("private_ips_classified_correctly", () => {
    expect(ipKind("10.0.0.1")).toBe("private");
    expect(ipKind("172.16.0.1")).toBe("private");
    expect(ipKind("192.168.1.1")).toBe("private");
    expect(ipKind("100.64.0.1")).toBe("private");
  });

  it("loopback_classified_as_loopback", () => {
    expect(ipKind("127.0.0.1")).toBe("loopback");
    expect(ipKind("::1")).toBe("loopback");
  });

  it("public_ips_classified_as_public", () => {
    expect(ipKind("8.8.8.8")).toBe("public");
    expect(ipKind("1.1.1.1")).toBe("public");
  });

  it("benchmarking_and_ula_ranges_are_private", () => {
    expect(ipKind("198.18.0.1")).toBe("private");
    expect(ipKind("fd12::1")).toBe("private");
  });

  it("public_ipv6_classified_as_public", () => {
    expect(ipKind("2606:4700:4700::1111")).toBe("public");
  });

  it("ipv6_unspecified_is_loopback_bucket", () => {
    expect(ipKind("::")).toBe("loopback");
  });
});

describe("validateUrl", () => {
  it("validate_url_blocks_userinfo_and_metadata_hostnames", () => {
    expect(() => validateUrl("http://user:pass@example.com/", true)).toThrow();
    expect(() => validateUrl("http://metadata.google.internal/", true)).toThrow();
    expect(() => validateUrl("http://metadata/", true)).toThrow();
    expect(() => validateUrl("http://metadata.azure.com/", true)).toThrow();
  });

  it("validate_url_rejects_non_http_schemes", () => {
    expect(() => validateUrl("ftp://example.com/", true)).toThrow();
    expect(() => validateUrl("file:///etc/passwd", true)).toThrow();
    expect(() => validateUrl("javascript:alert(1)", true)).toThrow();
  });

  it("validate_url_accepts_plain_https", () => {
    expect(validateUrl("https://api.openai.com/v1/models", false).hostname).toBe("api.openai.com");
    expect(() => validateUrl("http://localhost:1234/v1", true)).not.toThrow();
  });
});

describe("classifyAndCollectSafeIps", () => {
  it("loopback_literal_requires_private_opt_in", async () => {
    await expect(classifyAndCollectSafeIps("127.0.0.1", false)).rejects.toThrow();
    expect(await classifyAndCollectSafeIps("127.0.0.1", true)).toEqual(["127.0.0.1"]);
  });

  it("metadata_literal_rejected_even_with_private_opt_in", async () => {
    await expect(classifyAndCollectSafeIps("169.254.169.254", true)).rejects.toThrow();
    await expect(classifyAndCollectSafeIps("fd00:ec2::254", true)).rejects.toThrow();
  });

  it("public_literal_is_always_allowed", async () => {
    expect(await classifyAndCollectSafeIps("8.8.8.8", false)).toEqual(["8.8.8.8"]);
  });

  it("localhost_resolves_via_dns_path_and_requires_opt_in", async () => {
    await expect(classifyAndCollectSafeIps("localhost", false)).rejects.toThrow();
    const ips = await classifyAndCollectSafeIps("localhost", true);
    expect(ips.length).toBeGreaterThan(0);
    expect(ips.every((ip) => ipKind(ip) === "loopback")).toBe(true);
  });
});
