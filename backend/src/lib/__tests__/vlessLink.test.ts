import { describe, it, expect } from "vitest";
import { buildVlessLink } from "../xuiClient";

describe("buildVlessLink", () => {
  it("should generate a valid VLESS link with all required parameters", () => {
    const link = buildVlessLink({
      uuid: "12345678-1234-1234-1234-123456789abc",
      address: "1.2.3.4",
      port: 443,
      sni: "www.cloudflare.com",
      publicKey: "test_public_key_base64",
      flow: "xtls-rprx-vision",
      label: "Test Server",
    });

    expect(link).toContain("vless://12345678-1234-1234-1234-123456789abc@1.2.3.4:443");
    expect(link).toContain("type=tcp");
    expect(link).toContain("security=reality");
    expect(link).toContain("sni=www.cloudflare.com");
    expect(link).toContain("pbk=test_public_key_base64");
    expect(link).toContain("flow=xtls-rprx-vision");
    expect(link).toContain("#Test%20Server");
  });

  it("should handle special characters in label", () => {
    const link = buildVlessLink({
      uuid: "test-uuid",
      address: "10.0.0.1",
      port: 8443,
      sni: "example.com",
      publicKey: "key123",
      flow: "xtls-rprx-vision",
      label: "EU / Frankfurt #1",
    });

    expect(link).toContain("#EU%20%2F%20Frankfurt%20%231");
  });
});
