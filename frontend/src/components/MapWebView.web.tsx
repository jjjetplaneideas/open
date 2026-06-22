/**
 * Web map "WebView" via an <iframe srcDoc=...>.
 * react-native-webview on web only renders a 1x1 hidden iframe, so we render
 * a real iframe directly through react-native-web's createElement passthrough.
 */
import { useEffect, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

export type MapWebViewProps = {
  html: string;
  onMessage: (data: any) => void;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function MapWebView({ html, onMessage, onReady, style }: MapWebViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      // Only accept messages from our iframe
      if (iframeRef.current && ev.source !== iframeRef.current.contentWindow) return;
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (data && typeof data === "object") onMessage(data);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  return (
    <View style={style}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="map"
        onLoad={() => onReady?.()}
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
      />
    </View>
  );
}
