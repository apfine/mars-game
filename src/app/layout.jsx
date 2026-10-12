import './globals.css';

export const metadata = {
  title: 'Mars Dunes - Infinite Driving Game',
  description: 'Infinite procedurally generated Mars dune driving simulator with realistic physics, nitro boost, and atmospheric scattering.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
