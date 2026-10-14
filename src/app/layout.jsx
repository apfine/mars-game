import './globals.css';

export const metadata = {
  title: 'DUNES - Infinite Mars Driving Simulator',
  description: 'Infinite procedurally generated Mars dune driving simulator with realistic physics, nitro boost, authentic Mars exploration monuments, and atmospheric scattering.'
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
