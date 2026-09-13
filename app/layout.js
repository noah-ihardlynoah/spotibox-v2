import "./globals.css";

export const metadata = {
  title: "Spotibox",
  description: "Private rooms for Spotibox",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
