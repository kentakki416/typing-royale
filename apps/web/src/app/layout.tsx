import "./globals.css"

import type { Metadata } from "next"
import { JetBrains_Mono } from "next/font/google"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  description: "OSS の実コードを 120 秒で打鍵するエンジニア向けタイピングゲーム",
  title: "Typing Royale",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={jetbrainsMono.variable}>
        {children}
      </body>
    </html>
  )
}
