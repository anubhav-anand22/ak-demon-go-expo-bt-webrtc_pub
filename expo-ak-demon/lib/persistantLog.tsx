import RNBlobUtil, { Dirs } from "react-native-blob-util";
import { logger, transportFunctionType } from "react-native-logs";
import { pickSafFolder } from "./pickSafFolder";
import { Toast } from "toastify-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, PermissionsAndroid, Platform, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { getBaseDir } from "./getBaseDir";

let logFilePath: string;

const logCbArr = new Map<string, (...msg: string[]) => void>();

export const onAppLogger = (cb: (...msg: string[]) => void) => {
  const id = `${new Date().getTime()}-${Math.random()}`;
  logCbArr.set(id, cb);

  return () => {
    logCbArr.delete(id);
  };
};

const expoFileSystemTransport: transportFunctionType<any> = async (props) => {
  if (!logFilePath) return;

  try {
    const logMessage = `${props.msg}<END_OF_LOG_MSG>\n`;
    const l = props.msg + "\n";
    logCbArr.forEach((cb) => cb(l));

    await RNBlobUtil.fs.appendFile(logFilePath, logMessage, "utf8");
  } catch (error) {
    console.error("Failed to write log to external file:", error);
  }
};

export const appLogger = logger.createLogger({
  transport: expoFileSystemTransport,
  transportOptions: {
    // Important: Disable colors for file transports.
    // Otherwise, your text file will be full of unreadable ANSI escape codes.
    colors: false,
  },
});

async function requestFullStoragePermission(attempt = 3) {
  try {
    if ((attempt = 0)) return false;

    const testPath = RNBlobUtil.fs.dirs.LegacySDCardDir + "/test_permission.txt";

    await RNBlobUtil.fs.writeFile(testPath, "test", "utf8");
    await RNBlobUtil.fs.unlink(testPath);

    return true;
  } catch (error) {
    console.log(error);
    try {
      const pkg = Application.applicationId;
      Toast.error("Please grant 'All Files Access' to enable logging");
      const d = await IntentLauncher.startActivityAsync(
        "android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION",
        { data: `package:${pkg}` },
      );
      console.log(d);
      return requestFullStoragePermission(attempt - 1);
    } catch (launchError) {
      console.error("Failed to open settings", launchError);
    }
  }
}
export const initPersistentLogger = async () => {
  const { log: logFolderPath } = getBaseDir();
  logFilePath =
    logFolderPath +
    `/log-${new Date().getTime()}-${new Date().toISOString().replace(/ |\:|\\|\/|,/g, "-")}.log`;

  const granted = await requestFullStoragePermission();

  console.log({ granted });

  if (!(await RNBlobUtil.fs.exists(logFolderPath))) {
    await RNBlobUtil.fs.mkdir(logFolderPath);
  }

  const exists = await RNBlobUtil.fs.exists(logFilePath);

  if (!exists) {
    await RNBlobUtil.fs.writeFile(logFilePath, "", "utf8");
  }
};

export const getAllLogFiles = async () => {
  const { log } = getBaseDir();
  return (await RNBlobUtil.fs.ls(log)).filter((e) => e.endsWith(".log"));
};

export const getAllLogs = async (file: string) => {
  const { log } = getBaseDir();
  const logFilePath = `${log}/${file}`;
  console.log({ log, logFilePath });
  if (await RNBlobUtil.fs.exists(logFilePath)) {
    const rawLogs = (await RNBlobUtil.fs.readFile(logFilePath, "utf8")) as string;
    const logs = rawLogs.split("<END_OF_LOG_MSG>");
    return logs;
  } else {
    return [];
  }
};

export const PersistentLoggerWrapper = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();

  const [isLoggerInit, setIsLoggerInit] = useState(false);

  const init = async () => {
    try {
      await initPersistentLogger();
      setIsLoggerInit(true);
    } catch (e) {
      console.log(e);
      setIsLoggerInit(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  if (isLoggerInit) {
    return <>{children}</>;
  } else {
    return (
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ backgroundColor: colors.item, padding: 20, borderRadius: 10, gap: 10 }}>
          <Text style={{ color: colors.itemTxt }}>Loading logger...</Text>
          <ActivityIndicator size={"large"} />
        </View>
      </View>
    );
  }
};
