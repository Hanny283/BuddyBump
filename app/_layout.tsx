import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import WebDemoBanner from "../components/WebDemoBanner";
import ErrorBoundary from "../components/ErrorBoundary";
import { AuthProvider, useAuth } from "../lib/firebase/AuthContext";
import { DeepLinkProvider } from "../lib/locks/DeepLinkProvider";

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(tabs)";

    if (!user && inAuthGroup) {
      router.replace("/signin");
    } else if (user && !inAuthGroup && segments[0] !== "lock" && segments[0] !== "request-unlock" && segments[0] !== "select_apps") {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
    <AuthProvider>
      <DeepLinkProvider>
        <View style={{ flex: 1 }}>
          <WebDemoBanner />
          <AuthGate />
        </View>
      </DeepLinkProvider>
    </AuthProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
