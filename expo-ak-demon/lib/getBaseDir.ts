import { applicationName } from "expo-application";
import RNBlobUtil from "react-native-blob-util";

export const getBaseDir = () => {
  let base = "";
  if (applicationName?.startsWith("dev")) {
    base = RNBlobUtil.fs.dirs.LegacySDCardDir + "/dev-ak-demon";
  } else {
    base = RNBlobUtil.fs.dirs.LegacySDCardDir + "/ak-demon";
  }

  return {
    base,
    log: `${base}/log`,
  };
};
