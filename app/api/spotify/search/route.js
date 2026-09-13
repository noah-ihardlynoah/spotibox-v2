import { NextResponse } from "next/server";

export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim();
  const token = searchParams.get("token");

  if (!query || !token) {
    return NextResponse.json({ tracks: { items: [] } }, { status: 400 });
  }

  const response = await fetch(
    `https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}