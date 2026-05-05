APP_ENV=development npx expo prebuild --clean

eas build -p android --profile development --local
