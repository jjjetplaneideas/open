/**
 * Native map WebView using react-native-webview.
 * Web platform uses MapWebView.web.tsx (iframe).
 */
import { forwardRef } from "react";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { StyleProp, ViewStyle } from "react-native";

export type MapWebViewProps = {
  html: string;
  onMessage: (data: any) => void;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
};

const MapWebView = forwardRef<WebView, MapWebViewProps>(({ html, onMessage, onReady, style }, ref) => {
  return (
    <WebView
      ref={ref}
      source={{ html, baseUrl: "https://localhost" }}
      originWhitelist={["*"]}
      onMessage={(e: WebViewMessageEvent) => {
        try {
          onMessage(JSON.parse(e.nativeEvent.data));
        } catch {
          /* ignore */
        }
      }}
      onLoadEnd={() => onReady?.()}
      style={style}
      javaScriptEnabled
      domStorageEnabled
    />
  );
});

MapWebView.displayName = "MapWebView";
export default MapWebView;
