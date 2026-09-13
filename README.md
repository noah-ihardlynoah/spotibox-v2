# spotibox-v2

## Spotify setup

The room uses Spotify OAuth PKCE and the Web Playback SDK. Set these Vercel environment variables from the local `.env.local` values:

```text
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Add both redirect URLs to the Spotify developer dashboard for the app:

```text
http://localhost:3000/spotify-callback
https://your-vercel-domain.vercel.app/spotify-callback
```

Spotify requires the account connected by the host to have Premium for Web Playback. Run the additive SQL in `supabase/rooms.sql` after creating or updating the Supabase project.

