import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";
import { proxy } from "@/proxy";
import { POST as unlockRoute } from "@/app/api/unlock/route";

const SESSION_COOKIE = "session";

function requestFor(path: string, cookieValue?: string) {
  const url = `https://example.com${path}`;
  const headers = cookieValue ? { cookie: `${SESSION_COOKIE}=${cookieValue}` } : undefined;
  return new NextRequest(url, { headers });
}

function unlockRequest(passcode: unknown) {
  return new NextRequest("https://example.com/api/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
}

describe("proxy passcode gate (FR-026)", () => {
  beforeEach(() => {
    process.env.APP_PASSCODE = "correct-horse-battery-staple";
    process.env.SESSION_SECRET = "a".repeat(32);
  });

  it("redirects an uncookied GET / to /unlock", async () => {
    const response = await proxy(requestFor("/"));
    expect(getRedirectUrl(response!)).toBe("https://example.com/unlock");
  });

  it("rejects an incorrect passcode with 401", async () => {
    const response = await unlockRoute(unlockRequest("wrong-passcode"));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("issues a signed session cookie on the correct passcode, which then grants access", async () => {
    const unlockResponse = await unlockRoute(unlockRequest("correct-horse-battery-staple"));
    expect(unlockResponse.status).toBe(204);

    const setCookie = unlockResponse.headers.get("set-cookie");
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(setCookie).toMatch(/HttpOnly/i);

    const token = setCookie!.split(";")[0]!.split("=").slice(1).join("=");
    const gated = await proxy(requestFor("/", token));
    expect(getRedirectUrl(gated!)).toBeNull();
  });

  it("redirects when the session cookie is tampered with", async () => {
    const unlockResponse = await unlockRoute(unlockRequest("correct-horse-battery-staple"));
    const setCookie = unlockResponse.headers.get("set-cookie")!;
    const token = setCookie.split(";")[0]!.split("=").slice(1).join("=");
    const tampered = `${token}tampered`;

    const response = await proxy(requestFor("/", tampered));
    expect(getRedirectUrl(response!)).toBe("https://example.com/unlock");
  });
});
