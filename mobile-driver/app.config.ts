export default {
  expo: {
    name: "Filo Sürücü",
    slug: "filo-driver",
    scheme: "filodriver",
    version: "1.28.10",
    orientation: "portrait",
    ios: {
      bundleIdentifier: "com.filoplatform.driver",
      supportsTablet: false,
      infoPlist: {
        UIBackgroundModes: ["location"],
        NSLocationWhenInUseUsageDescription: "Aktif vardiyada rota ve araç güvenliği için konumunuz kullanılır.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Aktif vardiya ekran kapalıyken de rota ve araç güvenliği için konumunuz kullanılır.",
      },
    },
    android: {
      package: "com.filoplatform.driver",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "POST_NOTIFICATIONS",
      ],
    },
    extra: { eas: { projectId: process.env.EXPO_PROJECT_ID } },
    plugins: [["expo-location", {
      locationWhenInUsePermission: "Aktif vardiyada rota ve araç güvenliği için konumunuz kullanılır.",
      isIosBackgroundLocationEnabled: true,
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    }], "expo-notifications"],
  },
};
