import { ExpoConfig, ConfigContext } from "expo/config";
import { withAppBuildGradle } from "expo/config-plugins";
import packageJson from "./package.json";

const IS_DEV = process.env.APP_ENV === "development";
const APP_NAME = IS_DEV ? "dev-expo-ak-demon" : "expo-ak-demon";
const APP_IDENTIFIER = IS_DEV ? "com.ak22git7488.expoakdemon.dev" : "com.ak22git7488.expoakdemon";
const VERSION = packageJson.version;

console.log("--------------------------------------------------------------------");
console.log({ APP_IDENTIFIER, APP_NAME, IS_DEV });
console.log("--------------------------------------------------------------------");

const withCustomApkName = (config: ExpoConfig) => {
  return withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // This Gradle snippet tells Android to rename the output file
    // Note: We escape \${variant.name} so TypeScript doesn't parse it, letting Gradle handle it.
    const renameSnippet = `
// --- Custom APK Naming via Expo Config Plugin ---
android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def apkName = "${VERSION}-${APP_NAME}-" + variant.name + ".apk"
        outputFileName = apkName
    }
}
`;

    // Only append it if it hasn't been added yet
    if (!buildGradle.includes("Custom APK Naming")) {
      config.modResults.contents = buildGradle + "\n" + renameSnippet;
    }

    return config;
  });
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const expoConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    slug: "expo-ak-demon",
    version: VERSION,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "expoakdemon",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSBluetoothAlwaysUsageDescription: "This app uses Bluetooth to create a peripheral device",
        NSBluetoothPeripheralUsageDescription:
          "This app uses Bluetooth to create a peripheral device",
      },
      bundleIdentifier: APP_IDENTIFIER,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        "android.permission.MANAGE_EXTERNAL_STORAGE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
      package: APP_IDENTIFIER,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "react-native-ble-plx",
      "@config-plugins/react-native-webrtc",
      "expo-audio",
      "expo-background-task",
      "expo-mail-composer",
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
        },
      ],
      "expo-sqlite",
      "expo-video",
      "@react-native-community/datetimepicker",
      "expo-ignore-battery-optimizations",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "ef051978-0db2-412d-a2e5-04819cdd1854",
      },
    },
    owner: "ak22git7488",
  };
  return withCustomApkName(expoConfig);
};

// {
//   "expo": {
//     "name": "expo-ak-demon",
//     "slug": "expo-ak-demon",
//     "version": "0.0.12",
//     "orientation": "portrait",
//     "icon": "./assets/images/icon.png",
//     "scheme": "expoakdemon",
//     "userInterfaceStyle": "automatic",
//     "newArchEnabled": true,
//     "ios": {
//       "supportsTablet": true,
//       "infoPlist": {
//         "NSBluetoothAlwaysUsageDescription": "This app uses Bluetooth to create a peripheral device",
//         "NSBluetoothPeripheralUsageDescription": "This app uses Bluetooth to create a peripheral device"
//       },
//       "bundleIdentifier": "com.ak22git7488.expoakdemon"
//     },
//     "android": {
//       "adaptiveIcon": {
//         "backgroundColor": "#E6F4FE",
//         "foregroundImage": "./assets/images/android-icon-foreground.png",
//         "backgroundImage": "./assets/images/android-icon-background.png",
//         "monochromeImage": "./assets/images/android-icon-monochrome.png"
//       },
//       "edgeToEdgeEnabled": true,
//       "predictiveBackGestureEnabled": false,
//       "permissions": [
//         "android.permission.BLUETOOTH",
//         "android.permission.BLUETOOTH_ADMIN",
//         "android.permission.BLUETOOTH_SCAN",
//         "android.permission.BLUETOOTH_CONNECT",
//         "android.permission.ACCESS_FINE_LOCATION",
//         "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
//         "android.permission.MANAGE_EXTERNAL_STORAGE",
//         "android.permission.READ_EXTERNAL_STORAGE",
//         "android.permission.WRITE_EXTERNAL_STORAGE"
//       ],
//       "package": "com.ak22git7488.expoakdemon"
//     },
//     "web": {
//       "output": "static",
//       "favicon": "./assets/images/favicon.png"
//     },
//     "plugins": [
//       "expo-router",
//       [
//         "expo-splash-screen",
//         {
//           "image": "./assets/images/splash-icon.png",
//           "imageWidth": 200,
//           "resizeMode": "contain",
//           "backgroundColor": "#ffffff",
//           "dark": {
//             "backgroundColor": "#000000"
//           }
//         }
//       ],
//       "react-native-ble-plx",
//       "@config-plugins/react-native-webrtc",
//       "expo-audio",
//       "expo-background-task",
//       "expo-mail-composer",
//       [
//         "expo-secure-store",
//         {
//           "configureAndroidBackup": true
//         }
//       ],
//       "expo-sqlite",
//       "expo-video",
//       "@react-native-community/datetimepicker",
//       "expo-ignore-battery-optimizations"
//     ],
//     "experiments": {
//       "typedRoutes": true,
//       "reactCompiler": true
//     },
//     "extra": {
//       "router": {},
//       "eas": {
//         "projectId": "ef051978-0db2-412d-a2e5-04819cdd1854"
//       }
//     },
//     "owner": "ak22git7488"
//   }
// }
