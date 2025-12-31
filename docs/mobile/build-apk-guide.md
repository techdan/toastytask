# Building an Android APK for Toasty Task Mobile

This guide covers building a standalone APK for the Toasty Task mobile app.

## Prerequisites Check

Before building, verify you have all required tools installed.

### 1. Check Node.js and npm
```bash
node --version   # Should be 18.x or higher
npm --version    # Should be 9.x or higher
```

### 2. Check Java JDK (required for local builds)
```bash
java -version    # Should be JDK 17 or higher
```

If not installed:
- **Windows**: Download from https://adoptium.net/ (Temurin JDK 17)
- **macOS**: `brew install openjdk@17`
- **Linux**: `sudo apt install openjdk-17-jdk`

### 3. Check Android SDK (for local builds only)
```bash
# Check if ANDROID_HOME is set
echo %ANDROID_HOME%   # Windows
echo $ANDROID_HOME    # macOS/Linux

# Should point to Android SDK location, e.g.:
# Windows: C:\Users\<user>\AppData\Local\Android\Sdk
# macOS: ~/Library/Android/sdk
```

### 4. Check EAS CLI (recommended for builds)
```bash
eas --version
```

If not installed:
```bash
npm install -g eas-cli
```

### 5. Check Expo CLI
```bash
npx expo --version
```

---

## Build Options

### Option A: EAS Build (Recommended - Cloud Build)

EAS Build handles everything in the cloud. No local Android SDK needed.

#### First-time setup:
```bash
cd apps/mobile

# Login to Expo account (create one at expo.dev if needed)
eas login

# Configure the project for EAS Build
eas build:configure
```

This creates an `eas.json` file. Use this configuration:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

#### Build the APK:
```bash
# Development APK (for testing)
eas build --platform android --profile development

# Preview APK (for internal distribution)
eas build --platform android --profile preview

# Production AAB (for Play Store)
eas build --platform android --profile production
```

The build runs in the cloud. When complete, you'll get a download link.

---

### Option B: Local Build (Requires Android SDK)

#### 1. Generate native project
```bash
cd apps/mobile
npx expo prebuild --platform android
```

#### 2. Build the APK
```bash
cd android
./gradlew assembleRelease
```

The APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

#### 3. (Optional) Build debug APK
```bash
./gradlew assembleDebug
```

---

## App Configuration

Before building for production, update `app.json`:

```json
{
  "expo": {
    "name": "Toasty Task",
    "slug": "toasty-task",
    "version": "1.0.0",
    "android": {
      "package": "com.toastytask.mobile",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#f24c05"
      }
    },
    "extra": {
      "clerkPublishableKey": "pk_live_xxx",
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

---

## Environment Variables

For production builds, set environment variables:

### Using EAS Secrets (recommended):
```bash
eas secret:create --name CLERK_PUBLISHABLE_KEY --value "pk_live_xxx"
eas secret:create --name API_BASE_URL --value "https://api.toastytask.com"
```

### Or create `.env.production`:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
EXPO_PUBLIC_API_BASE_URL=https://api.toastytask.com
```

---

## Troubleshooting

### "SDK location not found"
Set ANDROID_HOME environment variable:
```bash
# Windows (PowerShell)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

# Add to PATH
$env:PATH += ";$env:ANDROID_HOME\platform-tools"
```

### "Java not found"
Ensure JAVA_HOME is set:
```bash
# Windows
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.x.x"
```

### Build fails with dependency errors
```bash
cd apps/mobile
rm -rf node_modules
npm install
npx expo prebuild --clean
```

### EAS build queued for too long
Free tier has limited concurrent builds. Upgrade to paid tier or wait.

---

## Quick Commands Reference

```bash
# Navigate to mobile app
cd apps/mobile

# Check tools
node --version && npm --version && eas --version

# EAS login
eas login

# Build development APK
eas build --platform android --profile development

# Build preview APK
eas build --platform android --profile preview

# Build production AAB
eas build --platform android --profile production

# Local build (after prebuild)
cd android && ./gradlew assembleRelease
```

---

## Next Steps After Building

1. **Test the APK** on a physical device or emulator
2. **Set up signing** for production releases
3. **Configure Play Store** listing
4. **Set up EAS Submit** for automated uploads
