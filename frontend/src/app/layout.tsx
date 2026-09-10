import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Consulting KB",
  description: "Knowledge base for consulting projects",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
