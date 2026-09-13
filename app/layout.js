import "./globals.css";

export const metadata = {
  title: "Spotibox",
  description: "Private rooms for Spotibox",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a
          className="repository-link"
          href="https://github.com/noah-ihardlynoah/spotibox-v2"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Spotibox GitHub repository"
        >
          <svg className="github-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17a4.6 4.6 0 0 1 1.24 3.22c0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .297" />
          </svg>
          <span>GitHub</span>
        </a>
        {children}
      </body>
    </html>
  );
}
