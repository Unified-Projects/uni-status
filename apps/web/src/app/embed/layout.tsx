import "@/app/globals.css";

export const metadata = {
  robots: "noindex, nofollow",
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-0 bg-transparent">
        {children}
      </body>
    </html>
  );
}
