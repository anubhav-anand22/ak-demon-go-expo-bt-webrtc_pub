import { Directory } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

const SAF_FOLDER_SECURE_STORE_KEY = "SAF_FOLDER";

export const pickSafFolder = async () => {
  try {
    const safFolderStored = await SecureStore.getItemAsync(SAF_FOLDER_SECURE_STORE_KEY);

    if (safFolderStored) {
      const haveAccess = verifyStoredFolderAccess(safFolderStored);
      if (haveAccess) {
        return safFolderStored;
      }
    }

    const selectedDir = await Directory.pickDirectoryAsync();

    if (selectedDir) {
      const safUri = selectedDir.uri;
      console.log("User selected SAF URI:", safUri);

      SecureStore.setItemAsync(SAF_FOLDER_SECURE_STORE_KEY, safUri);

      return safUri;
    } else {
      console.log("User canceled the picker.");
      return null;
    }
  } catch (error) {
    console.error("Error picking directory:", error);
  }
};

export const verifyStoredFolderAccess = (storedSafUri: string): boolean => {
  try {
    const savedDir = new Directory(storedSafUri);

    if (savedDir.exists) {
      console.log(`Access confirmed! You can safely write to: ${savedDir.name}`);

      return true;
    } else {
      console.warn("Access lost. The folder was either deleted or permissions were revoked.");
      return false;
    }
  } catch (error) {
    console.error("Error verifying directory:", error);
    return false;
  }
};
