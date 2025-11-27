# Setting up Android Emulator for WOLE

This guide explains how to set up an Android emulator to run the WOLE application and connect to the local development server.

## Prerequisites

1.  **Android SDK**: Ensure the Android SDK is installed. Since `adb` is available in your environment, you likely have the platform-tools.
2.  **Android Emulator**: You need the emulator component.
    *   If you have **Android Studio**, use the **Device Manager** to create and manage virtual devices (AVDs).
    *   If you are using command-line tools only, you need to install the emulator package: `sdkmanager "emulator" "system-images;android-33;google_apis;x86_64"` (example image).

## Automated Setup (Recommended)

I have created a script to automate the setup process, which handles path issues and license acceptance.

1.  Run the setup script:
    ```bash
    ./setup_emulator.sh
    ```
    *   This will install the required system image (`android-33`) and create an AVD named `wole_emulator`.
    *   **Note**: You might see a warning about "XML version 4". This is safe to ignore.

2.  Once the script finishes, start the emulator:
    ```bash
    $HOME/Android/emulator/emulator -avd wole_emulator
    ```

## Manual Setup

If you prefer to set it up manually or if the script fails:

### Step 1: Install System Image
Use the full path to `sdkmanager` to avoid path issues:
```bash
yes | $HOME/Android/cmdline-tools/latest/bin/sdkmanager "system-images;android-33;google_apis;x86_64"
```

### Step 2: Create AVD
```bash
echo "no" | $HOME/Android/cmdline-tools/latest/bin/avdmanager create avd -n wole_emulator -k "system-images;android-33;google_apis;x86_64" --device "pixel" --force
```

### Step 3: Run Emulator
```bash
$HOME/Android/emulator/emulator -avd wole_emulator
```

## WSL Users (Windows Subsystem for Linux)

**Yes, you can run the emulator directly in WSL 2!**

Your environment supports it because:
1.  **WSLg** is active (GUI apps work).
2.  **KVM** is available (`/dev/kvm` exists).

### Critical Step: Enable KVM Permissions
You must have permission to access `/dev/kvm` to run the emulator with hardware acceleration.

1.  Add your user to the `kvm` group:
    ```bash
    sudo usermod -aG kvm $USER
    ```
2.  **Log out and log back in** (or restart the WSL terminal) for this change to take effect.
    *   **Quick Fix**: Run `newgrp kvm` in your current terminal to apply the change immediately without logging out.
    *   You can verify it by running `groups`. You should see `kvm` in the list.

### Troubleshooting WSL
*   **Performance**: If the emulator is slow or crashes, ensure you are on the latest WSL version (`wsl --update` in PowerShell).
### Hybrid Setup (Recommended for Performance)
If the WSL emulator is too slow, you can run the emulator on Windows and connect to it from WSL. This gives you native performance while keeping your dev environment in WSL.

**Prerequisites:**
1.  Install **Android Studio** on Windows.
2.  **Create the Virtual Device (AVD)**:
    *   Open Android Studio.
    *   On the Welcome screen, click **More Actions** > **Virtual Device Manager**.
    *   (Or if a project is open: **Tools** > **Device Manager**).
    *   Click **Create Device** (or the **+** button).
    *   Select a Phone (e.g., **Pixel 6**) and click **Next**.
    *   Select a System Image (e.g., **Release Name: Tiramisu**, API Level: 33) and click **Next**.
    *   Click **Finish**.
3.  Ensure `adb` is installed on Windows (part of Platform Tools).

**Steps:**
1.  **Start the Emulator on Windows**.
2.  **Kill the adb server on Windows** (to ensure it restarts with the right settings):
    *   Open PowerShell/CMD and run: `adb kill-server`
3.  **Start the adb server on Windows** allowing remote connections:
    *   Run: `adb -a nodaemon server start`
    *   *Note: You might need to allow `adb` through the Windows Firewall.*
    *   *Alternative*: Just running the emulator might start adb, but explicitly running it with `-a` ensures it listens on all interfaces.
4.  **Connect from WSL**:
    *   **Option A (Try this first)**: Run `export ADB_SERVER_SOCKET=tcp:127.0.0.1:5037`
        *   *This works if you have WSL 2 Mirrored Networking enabled.*
    *   **Option B (Fallback)**: If Option A fails, use the dynamic IP:
        ```bash
        export ADB_SERVER_SOCKET=tcp:$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):5037
        ```

5.  **Verify Connection**:
    *   Run `adb devices` in WSL. You should see the emulator running on Windows.

**Permanent Fix**:
Add the export command to your `~/.bashrc` or `~/.zshrc`:
```bash
# Try localhost first, it's faster and more reliable on new WSL versions
echo 'export ADB_SERVER_SOCKET=tcp:127.0.0.1:5037' >> ~/.zshrc
source ~/.zshrc
```

### Troubleshooting Hybrid Connection
*   **"Connection refused"**: This means WSL cannot reach the Windows ADB server.
    1.  **Kill Server**: Run `adb kill-server` in Windows PowerShell.
    2.  **Restart with Access**: Run `adb -a nodaemon server start` in Windows PowerShell. Keep this window open!
    3.  **Firewall**: A Windows Firewall popup might appear. **Allow access** for `adb.exe` on Private/Public networks.

## Troubleshooting

*   **"XML version 4" Warning**: This is due to a minor version mismatch in the command-line tools. It is generally non-fatal for installation.
*   **"Package path is not valid"**: This usually happens if the package name is incorrect or if `sdkmanager` cannot find the repository. Using the full path to `sdkmanager` (as shown above) often resolves this.

## Step 3: Configure the Project

The `package.json` file has a hardcoded IP address for the Metro bundler:

```json
"android": "REACT_NATIVE_PACKAGER_HOSTNAME=192.168.8.6 expo run:android"
```

**Important**: This IP (`192.168.8.6`) must match the IP address of your development machine on the network that the emulator is connected to.
*   If the emulator is running on the **same machine**, you can often remove `REACT_NATIVE_PACKAGER_HOSTNAME=...` and let Expo handle it (it usually defaults to localhost or the LAN IP).
*   If you encounter connection issues, verify your machine's IP using `ip addr` or `ifconfig` and update the script or run the command manually:
    ```bash
    export REACT_NATIVE_PACKAGER_HOSTNAME=YOUR_IP_ADDRESS
    npx expo run:android
    ```

## Step 4: Run the App

Once the emulator is running and connected (visible in `adb devices`), run:

```bash
npm run android
```

This will:
1.  Start the Metro bundler.
2.  Build the Android app.
3.  Install it on the running emulator.
4.  Launch the app.

## Accessing the Web UI from Emulator

If you want to access the web UI (Vite) from the emulator's browser:
1.  Start the web server: `npm run dev` (in `web/` directory).
2.  In the emulator browser, use the special IP `10.0.2.2` to access the host's localhost.
    *   Example: `http://10.0.2.2:5173` (if Vite runs on 5173).

## Troubleshooting

*   **`emulator` command not found**: Add the emulator directory to your PATH.
    ```bash
    export PATH=$PATH:$ANDROID_HOME/emulator
    ```
*   **KVM permission denied**: Ensure your user has permissions to use KVM (Linux).
    ```bash
    sudo usermod -aG kvm $USER
    ```
