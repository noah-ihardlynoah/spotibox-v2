import { NextResponse } from "next/server";

export async function POST(request) {
  const { code, codeVerifier, redirectUri } = await request.json();
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId || !code || !codeVerifier || !redirectUri) {
    return NextResponse.json({ error: "Missing Spotify OAuth details." }, { status: 400 });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: data.error_description || "Spotify login failed." }, { status: response.status });
  }

  return NextResponse.json(data);
}