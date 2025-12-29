export default {
  expo: {
    name: "Toasty Task",
    slug: "toasty-task",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#f24c05",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.toastytask.app",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#f24c05",
      },
      package: "com.toastytask.app",
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      eas: {
        projectId: "your-eas-project-id",
      },
    },
    scheme: "toastytask",
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#f24c05",
          image: "./assets/splash-icon.png",
          imageWidth: 200,
        },
      ],
    ],
  },
};
