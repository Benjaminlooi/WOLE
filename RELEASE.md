# Release Process

This project uses GitHub Actions to automate the build and release process.

## Workflow Overview

The workflow is defined in `.github/workflows/release.yml`. It performs the following steps:
1.  **Setup**: Installs Node.js, Java, and dependencies.
2.  **Prebuild**: Runs `npx expo prebuild` to ensure the Android project is up-to-date with `app.json`.
3.  **Build Web**: Builds the Vite web app and outputs it to `android/app/src/main/assets/web`.
4.  **Build Android**: Builds the Android APK (`assembleRelease`).
5.  **Release**: Creates a GitHub Release and uploads the APK and Web Build ZIP.

## Triggering a Release

To trigger a release, push a tag starting with `v` (e.g., `v1.0.0`).

```bash
git tag v1.0.0
git push origin v1.0.0
```

You can also manually trigger the workflow from the "Actions" tab in GitHub.

## Signing the APK (Optional)

By default, the workflow will build an unsigned or debug-signed APK if no secrets are provided. To produce a signed release APK, you need to add the following **Secrets** to your GitHub Repository (Settings > Secrets and variables > Actions):

| Secret Name | Description |
| :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | The contents of your `.keystore` or `.jks` file encoded in Base64. |
| `ANDROID_KEY_ALIAS` | The alias of the key in the keystore. |
| `ANDROID_KEY_PASSWORD` | The password for the key. |
| `ANDROID_STORE_PASSWORD` | The password for the keystore. |

### How to generate `ANDROID_KEYSTORE_BASE64`

Run the following command in your terminal (replace `your-upload-key.keystore` with your actual keystore file):

```bash
base64 -w 0 your-upload-key.keystore > keystore_base64.txt
# On macOS:
# base64 -i your-upload-key.keystore -o keystore_base64.txt
```

Copy the content of `keystore_base64.txt` and paste it into the `ANDROID_KEYSTORE_BASE64` secret.

## Artifacts

The release will contain:
- `app-release.apk`: The Android application (installable on devices).
- `web-build.zip`: The zipped web assets (for reference or standalone use).
