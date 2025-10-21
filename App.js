import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  H1,
  Paragraph,
  ScrollView,
  SizableText,
  TamaguiProvider,
  Theme,
  XStack,
  YStack,
  Input,
} from 'tamagui';
import { tamaguiConfig } from './tamagui.config';
import { startWolServer, stopWolServer } from './native/WolServerModule';

const statusSubscribers = new Set();

const logStatus = (message) => {
  const timestamped = `[${new Date().toISOString()}] ${message}`;
  console.log(timestamped);
  statusSubscribers.forEach((handler) => handler(timestamped));
};

const subscribeToStatus = (handler) => {
  statusSubscribers.add(handler);
  return () => {
    statusSubscribers.delete(handler);
  };
};

const StatusChip = ({ isRunning, port, backgroundColor, accentColor, label }) => (
  <XStack
    alignItems="center"
    backgroundColor={backgroundColor}
    borderRadius="$10"
    gap="$2"
    paddingHorizontal="$3"
    paddingVertical="$1.5"
  >
    <SizableText size="$3" fontWeight="700" color={accentColor}>
      {label}
    </SizableText>
    {isRunning && (
      <SizableText size="$2" color="$color">
        Port {port}
      </SizableText>
    )}
  </XStack>
);

const DEFAULT_PORT = '8080';

const AppContent = () => {
  const [listenPort, setListenPort] = useState(DEFAULT_PORT);
  const [sharedSecret, setSharedSecret] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [statusLog, setStatusLog] = useState([]);
  const [activePort, setActivePort] = useState(null);
  const logScrollRef = useRef(null);

  useEffect(() => {
    return subscribeToStatus((entry) => {
      setStatusLog((current) => {
        const next = [entry, ...current];
        return next.slice(0, 200);
      });
    });
  }, []);

  useEffect(() => {
    setIsRunning(false);
  }, []);

  useEffect(() => {
    startRelay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [statusLog]);

  const ensureForegroundServiceReady = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const sdkInt = Number(Platform.Version);
    if (!Number.isNaN(sdkInt) && sdkInt >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Notifications required',
            'Grant notification permission to run the foreground service.',
          );
          return false;
        }
      } catch (e) {
        Alert.alert(
          'Permission error',
          'Could not request notification permission.',
        );
        return false;
      }
    }

    return true;
  }, []);

  const startRelay = useCallback(async () => {
    const portNumber = Number(listenPort);
    if (Number.isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
      Alert.alert('Invalid port', 'Please enter a TCP port between 1 and 65535.');
      return;
    }

    if (isRunning) {
      Alert.alert('Already running', 'The WOL relay is already running.');
      return;
    }

    const ok = await ensureForegroundServiceReady();
    if (!ok) {
      return;
    }

    try {
      await startWolServer({ port: portNumber, token: sharedSecret || null });
      logStatus(`Wake relay listening on port ${portNumber}`);
      setIsRunning(true);
      setActivePort(portNumber);
    } catch (error) {
      Alert.alert('Failed to start relay', error.message);
    }
  }, [listenPort, sharedSecret, ensureForegroundServiceReady, isRunning]);

  const stopRelay = useCallback(async () => {
    if (!isRunning) return;
    try {
      await stopWolServer();
      setIsRunning(false);
      setActivePort(null);
      logStatus('Wake relay stopped');
    } catch (error) {
      Alert.alert('Failed to stop relay', error.message);
    }
  }, [isRunning]);

  const handleClearLog = useCallback(() => {
    setStatusLog([]);
  }, []);

  const handleOpenWebUi = useCallback(() => {
    const portNumber = Number(activePort ?? listenPort);
    if (Number.isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
      Alert.alert('Invalid port', 'Set a valid port before opening the web UI.');
      return;
    }

    const url = `http://127.0.0.1:${portNumber}/`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Open failed', 'Could not launch the relay web interface.');
    });
  }, [activePort, listenPort]);

  const handleOpenBatterySettings = useCallback(() => {
    if (Platform.OS === 'android') {
      Linking.openSettings().catch(() => {
        Alert.alert(
          'Settings unavailable',
          'Open system settings manually to disable battery optimizations for this app.',
        );
      });
      return;
    }

    Alert.alert('Android only', 'Battery optimization settings are only available on Android.');
  }, []);

  const statusInfo = useMemo(() => {
    const portLabel = activePort ?? listenPort;
    return {
      label: isRunning ? 'Running' : 'Stopped',
      hint: isRunning
        ? `Listening on port ${portLabel} for authenticated wake requests.`
        : 'Start the relay to accept remote wake packets.',
      accentColor: isRunning ? '#22c55e' : '#f87171',
      chipBackground: isRunning ? 'rgba(34,197,94,0.16)' : 'rgba(248,113,113,0.16)',
      portLabel,
    };
  }, [activePort, isRunning, listenPort]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <YStack flex={1} backgroundColor="$background">
        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack paddingHorizontal="$5" paddingBottom="$8" paddingTop="$6" gap="$6">
            <Card
              elevate
              size="$5"
              borderWidth={1}
              borderColor="$borderColor"
              padding="$5"
              borderRadius="$8"
              gap="$4"
            >
              <YStack gap="$2">
                <H1 size="$8" color="$color">
                  WOLE Relay
                </H1>
                <Paragraph size="$4" theme="alt1">
                  Manage the Wake-on-LAN relay service running on this device.
                </Paragraph>
              </YStack>

              <YStack gap="$3">
                <StatusChip
                  isRunning={isRunning}
                  port={statusInfo.portLabel}
                  backgroundColor={statusInfo.chipBackground}
                  accentColor={statusInfo.accentColor}
                  label={statusInfo.label}
                />
                <Paragraph size="$3" theme="alt1">
                  {statusInfo.hint}
                </Paragraph>
              </YStack>

              <YStack gap="$3">
                <XStack gap="$3" flexWrap="wrap">
                  <Button
                    theme="blue"
                    size="$4"
                    flex={1}
                    disabled={isRunning}
                    onPress={startRelay}
                  >
                    Start Relay
                  </Button>
                  <Button
                    theme="red"
                    size="$4"
                    flex={1}
                    disabled={!isRunning}
                    onPress={stopRelay}
                  >
                    Stop Relay
                  </Button>
                </XStack>
                <Button
                  theme="blue"
                  variant="outlined"
                  size="$4"
                  disabled={!isRunning}
                  onPress={handleOpenWebUi}
                >
                  Open Web UI
                </Button>
                <Button
                  variant="outlined"
                  size="$4"
                  onPress={handleOpenBatterySettings}
                >
                  Battery Optimization Settings
                </Button>
                <Paragraph size="$2" theme="alt1">
                  Disable optimizations so the relay stays responsive in the background.
                </Paragraph>
              </YStack>
            </Card>

            <Card
              elevate
              size="$5"
              borderWidth={1}
              borderColor="$borderColor"
              padding="$5"
              borderRadius="$8"
              gap="$4"
            >
              <YStack gap="$2">
                <SizableText size="$5" fontWeight="600" color="$color">
                  Configuration
                </SizableText>
                <Paragraph size="$3" theme="alt1">
                  Define how the relay listens for wake requests from your network.
                </Paragraph>
              </YStack>

              <YStack gap="$2">
                <SizableText size="$3" fontWeight="600" color="$color">
                  Listen Port
                </SizableText>
                <Input
                  value={listenPort}
                  onChangeText={setListenPort}
                  placeholder="8080"
                  keyboardType="numeric"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <Paragraph size="$2" theme="alt1">
                  Choose a TCP port that is reachable from your devices.
                </Paragraph>
              </YStack>

              <YStack gap="$2">
                <SizableText size="$3" fontWeight="600" color="$color">
                  Shared Secret Token
                </SizableText>
                <Input
                  value={sharedSecret}
                  onChangeText={setSharedSecret}
                  placeholder="Required if relay is exposed publicly"
                  secureTextEntry
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <Paragraph size="$2" theme="alt1">
                  Optional for trusted networks; recommended when the relay can be reached from the internet.
                </Paragraph>
              </YStack>
            </Card>

            <Card
              elevate
              size="$5"
              borderWidth={1}
              borderColor="$borderColor"
              padding="$5"
              borderRadius="$8"
              gap="$4"
            >
              <XStack alignItems="center" justifyContent="space-between">
                <SizableText size="$5" fontWeight="600" color="$color">
                  Event Log
                </SizableText>
                <Button
                  size="$3"
                  variant="outlined"
                  disabled={!statusLog.length}
                  onPress={handleClearLog}
                >
                  Clear
                </Button>
              </XStack>
              <Paragraph size="$3" theme="alt1">
                Recent activity and status messages from the native relay service.
              </Paragraph>
              <YStack
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$6"
                backgroundColor="rgba(2,6,23,0.65)"
                overflow="hidden"
              >
                <ScrollView
                  ref={logScrollRef}
                  style={{ maxHeight: 260 }}
                  contentContainerStyle={{ padding: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  <YStack gap="$2">
                    {statusLog.map((entry, index) => (
                      <SizableText
                        key={`${entry}-${index}`}
                        size="$2"
                        fontFamily="$mono"
                        color="$color"
                      >
                        {entry}
                      </SizableText>
                    ))}
                    {!statusLog.length && (
                      <Paragraph size="$2" theme="alt1" fontStyle="italic">
                        No events yet. Start the relay to begin logging.
                      </Paragraph>
                    )}
                  </YStack>
                </ScrollView>
              </YStack>
            </Card>
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Theme name="dark">
        <AppContent />
      </Theme>
    </TamaguiProvider>
  );
}
