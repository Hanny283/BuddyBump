import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ErrorBoundary from "../components/ErrorBoundary";
import { AuthProvider } from "../lib/firebase/AuthContext";
import { DeepLinkProvider } from "../lib/locks/DeepLinkProvider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
    <AuthProvider>
      <DeepLinkProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DeepLinkProvider>
    </AuthProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
