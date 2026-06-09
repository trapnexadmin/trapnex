/**
 * TradingView Advanced Chart Widget
 * Embeds TradingView's professional charting library
 * No API key required - free to use
 */

import { useEffect, useRef } from "react";

const TradingViewWidget = ({
  symbol = "NSE:NIFTY",
  // symbol = "MCX:CRUDEOIL",
  interval = "1",
  theme = "dark",
  height = 600,
}) => {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    // Load TradingView script if not already loaded
    if (!window.TradingView) {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = () => initWidget();
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    function initWidget() {
      if (containerRef.current && window.TradingView) {
        // Clear previous widget
        containerRef.current.innerHTML = "";

        // Create new widget
        widgetRef.current = new window.TradingView.widget({
          container_id: containerRef.current.id,
          symbol: symbol,
          interval: interval,
          timezone: "Asia/Kolkata",
          theme: theme,
          style: "1", // Candlestick
          locale: "en",
          toolbar_bg: theme === "dark" ? "#1e222d" : "#f1f3f6",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: true,
          container_id: containerRef.current.id,
          autosize: true,
          studies: [
            "MASimple@tv-basicstudies", // Moving Average
            "Volume@tv-basicstudies", // Volume
          ],
          disabled_features: ["use_localstorage_for_settings", "header_widget"],
          enabled_features: [
            "study_templates",
            "side_toolbar_in_fullscreen_mode",
          ],
          overrides: {
            "paneProperties.background":
              theme === "dark" ? "#131722" : "#ffffff",
            "paneProperties.vertGridProperties.color":
              theme === "dark" ? "#363c4e" : "#e1e3eb",
            "paneProperties.horzGridProperties.color":
              theme === "dark" ? "#363c4e" : "#e1e3eb",
          },
        });
      }
    }

    // Cleanup on unmount
    return () => {
      if (widgetRef.current && widgetRef.current.remove) {
        widgetRef.current.remove();
      }
    };
  }, [symbol, interval, theme]);

  return (
    <div className="w-full h-full">
      <div
        ref={containerRef}
        id="tradingview-widget-container"
        style={{ height: `${height}px` }}
        className="rounded-lg overflow-hidden"
      />
    </div>
  );
};

export default TradingViewWidget;
