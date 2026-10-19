import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getLdapConfig,
  classifyLdapError,
  getLdapUserErrorMessage,
} from "../../src/lib/ldap";

describe("LDAP Library", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getLdapConfig", () => {
    it("returns default values when environment variables are not set", () => {
      delete process.env.LDAP_SERVER;
      delete process.env.LDAP_PORT;
      delete process.env.LDAP_BASE_DN;
      delete process.env.LDAP_USER;
      delete process.env.LDAP_PASS;
      delete process.env.LDAP_TIMEOUT_MS;

      const config = getLdapConfig();
      expect(config.server).toBe("ldap://correo.local");
      expect(config.port).toBe(389);
      expect(config.baseDn).toBe("DC=correo,DC=local");
      expect(config.user).toBe("");
      expect(config.pass).toBe("");
      expect(config.timeoutMs).toBe(5000);
    });

    it("reads custom environment variables dynamically from process.env", () => {
      process.env.LDAP_SERVER = "ldap://test.dc.local";
      process.env.LDAP_PORT = "636";
      process.env.LDAP_BASE_DN = "DC=test,DC=local";
      process.env.LDAP_USER = "TEST\\user";
      process.env.LDAP_PASS = "Secret123";
      process.env.LDAP_TIMEOUT_MS = "8000";

      const config = getLdapConfig();
      expect(config.server).toBe("ldap://test.dc.local");
      expect(config.port).toBe(636);
      expect(config.baseDn).toBe("DC=test,DC=local");
      expect(config.user).toBe("TEST\\user");
      expect(config.pass).toBe("Secret123");
      expect(config.timeoutMs).toBe(8000);
    });
  });

  describe("classifyLdapError", () => {
    it("classifies connection timeout as network failure", () => {
      const err = new Error("connection timeout");
      const res = classifyLdapError(err);
      expect(res.isNetworkFailure).toBe(true);
      expect(res.isAuthFailure).toBe(false);
    });

    it("classifies ECONNREFUSED as network failure", () => {
      const err = new Error("connect ECONNREFUSED 10.1.10.51:389");
      const res = classifyLdapError(err);
      expect(res.isNetworkFailure).toBe(true);
      expect(res.isAuthFailure).toBe(false);
    });

    it("classifies ETIMEDOUT code as network failure", () => {
      const err = Object.assign(new Error("operation timed out"), { code: "ETIMEDOUT" });
      const res = classifyLdapError(err);
      expect(res.isNetworkFailure).toBe(true);
      expect(res.isAuthFailure).toBe(false);
    });

    it("classifies invalid credentials error (code 49) as auth failure", () => {
      const err = Object.assign(new Error("80090308: LdapErr: DSID-0C090447, comment: AcceptSecurityContext error, data 52e, v3839"), {
        code: 49,
      });
      const res = classifyLdapError(err);
      expect(res.isNetworkFailure).toBe(false);
      expect(res.isAuthFailure).toBe(true);
    });

    it("classifies missing configuration error", () => {
      const err = new Error("LDAP_USER y LDAP_PASS requeridos en el entorno");
      const res = classifyLdapError(err);
      expect(res.isConfigMissing).toBe(true);
    });

    it("handles generic errors cleanly", () => {
      const err = new Error("Unexpected error occurred");
      const res = classifyLdapError(err);
      expect(res.isNetworkFailure).toBe(false);
      expect(res.isAuthFailure).toBe(false);
      expect(res.isConfigMissing).toBe(false);
    });
  });

  describe("getLdapUserErrorMessage", () => {
    it("returns a neutral message for timeouts without technical jargon", () => {
      const msg = getLdapUserErrorMessage(new Error("connection timeout"));
      expect(msg).toBe(
        "El servicio no está disponible en este momento. Intente nuevamente en unos minutos.",
      );
      expect(msg).not.toContain("tiempo de espera agotado");
      expect(msg).not.toContain("VPN");
    });

    it("returns a neutral message for invalid credentials", () => {
      const msg = getLdapUserErrorMessage(
        Object.assign(new Error("invalid credentials"), { code: 49 }),
      );
      expect(msg).toBe(
        "El servicio no está disponible en este momento. Intente nuevamente en unos minutos.",
      );
      expect(msg).not.toContain("credenciales de servicio");
    });

    it("returns a neutral message when credentials are not configured", () => {
      const msg = getLdapUserErrorMessage(
        new Error("LDAP_USER y LDAP_PASS requeridos"),
      );
      expect(msg).toBe(
        "El servicio no está disponible en este momento. Intente nuevamente en unos minutos.",
      );
      expect(msg).not.toContain("no configuradas");
    });
  });
});
