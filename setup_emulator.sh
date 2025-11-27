#!/bin/bash

# Android Emulator Setup Script for WOLE

SDK_MANAGER="$HOME/Android/cmdline-tools/latest/bin/sdkmanager"
AVD_MANAGER="$HOME/Android/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$HOME/Android/emulator/emulator"
SYSTEM_IMAGE="system-images;android-33;google_apis;x86_64"
AVD_NAME="wole_emulator"

echo "Checking for sdkmanager..."
if [ ! -f "$SDK_MANAGER" ]; then
    echo "Error: sdkmanager not found at $SDK_MANAGER"
    echo "Please verify your Android SDK installation."
    exit 1
fi

echo "Installing system image (this may take a while)..."
echo "Accepting licenses automatically..."
yes | "$SDK_MANAGER" "$SYSTEM_IMAGE"

echo "Creating Android Virtual Device (AVD): $AVD_NAME..."
# Check if AVD already exists
if "$AVD_MANAGER" list avd | grep -q "$AVD_NAME"; then
    echo "AVD $AVD_NAME already exists. Skipping creation."
else
    echo "no" | "$AVD_MANAGER" create avd -n "$AVD_NAME" -k "$SYSTEM_IMAGE" --device "pixel" --force
    echo "AVD created successfully."
fi

echo "Setup complete!"
echo "To run the emulator, use:"
echo "$EMULATOR -avd $AVD_NAME"
