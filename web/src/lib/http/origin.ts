import { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;

  if (!host) {
    return request.nextUrl.origin;
  }

  const protocol =
    forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";

  return `${protocol}://${host}`;
}
