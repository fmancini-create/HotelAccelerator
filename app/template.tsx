import Script from "next/script"

const ANNA_4BID_WIDGET_KEY = "wk_ad8bd17c111f45d4851aab309ec858cdc551"

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script
        src="/anna-chat.js"
        data-widget-key={ANNA_4BID_WIDGET_KEY}
        strategy="afterInteractive"
      />
    </>
  )
}
