import './globals.css';

export const metadata = {
  title: 'US Stocks Alert',
  description: 'Real-time US stock price alerts on Telegram and Gmail',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
