import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  signSession,
  verifyPasscode,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  const expected = process.env.APP_PASSCODE ?? "";

  const valid = expected.length > 0 && (await verifyPasscode(passcode, expected));

  if (!valid) {
    return NextResponse.json(
      { error: { code: "invalid_passcode", message: "Incorrect passcode." } },
      { status: 401 },
    );
  }

  const token = await signSession({ sub: "study-app-user" });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
