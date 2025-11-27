import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, PermissionsAndroid, Platform, Animated, Easing, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Button,
  H1,
  H2,
  Paragraph,
  ScrollView,
  SizableText,
  TamaguiProvider,
  Theme,
  XStack,
  YStack,
  Input,
  Switch,
  Spacer,
  Stack,
} from 'tamagui';
import { useFonts, Syne_700Bold, Syne_500Medium } from '@expo-google-fonts/syne';
import { Manrope_400Regular, Manrope_600SemiBold } from '@expo-google-fonts/manrope';
import { Ionicons } from '@expo/vector-icons';
import { tamaguiConfig } from './tamagui.config';
import { startWolServer, stopWolServer } from './native/WolServerModule';

const statusSubscribers = new Set();

const logStatus = (message) => {
  const timestamped = `[${new Date().toISOString().split('T')[1].slice(0, 8)}] ${message}`;
  console.log(timestamped);
  statusSubscribers.forEach((handler) => handler(timestamped));
};

const subscribeToStatus = (handler) => {
  statusSubscribers.add(handler);
  return () => {
    statusSubscribers.delete(handler);
  };
};

const DEFAULT_PORT = '8080';

const StatusOrb = ({ isRunning, onPress }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      ).start();
      
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: true,
          easing: Easing.linear,
        })
      ).start();
    } else {
      pulseAnim.setValue(1);
      rotateAnim.setValue(0);
    }
  }, [isRunning]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Stack alignItems="center" justifyContent="center" width={240} height={240}>
        {/* Outer Glow */}
        <Animated.View
          style={{
            position: 'absolute',
            width: 240,
            height: 240,
            borderRadius: 120,
            backgroundColor: isRunning ? 'rgba(34, 211, 238, 0.1)' : 'rgba(239, 68, 68, 0.05)',
            transform: [{ scale: pulseAnim }],
          }}
        />
        {/* Inner Ring */}
        <Animated.View
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: 100,
            borderWidth: 2,
            borderColor: isRunning ? 'rgba(34, 211, 238, 0.3)' : 'rgba(239, 68, 68, 0.2)',
            borderStyle: 'dashed',
            transform: [{ rotate: spin }],
          }}
        />
        {/* Core */}
        <LinearGradient
          colors={isRunning ? ['#22d3ee', '#0891b2'] : ['#ef4444', '#991b1b']}
          style={{
            width: 160,
            height: 160,
            borderRadius: 80,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: isRunning ? '#22d3ee' : '#ef4444',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <Ionicons name="power" size={64} color="white" />
          <SizableText color="white" fontFamily="Syne_700Bold" fontSize={18} marginTop={8}>
            {isRunning ? 'ONLINE' : 'OFFLINE'}
          </SizableText>
        </LinearGradient>
      </Stack>
    </TouchableOpacity>
  );
};

const GlassCard = ({ children, style }) => (
  <Stack
    backgroundColor="rgba(255, 255, 255, 0.05)"
    borderColor="rgba(255, 255, 255, 0.1)"
    borderWidth={1}
    borderRadius={24}
    padding={20}
    {...style}
  >
    {children}
  </Stack>
);

const AppContent = () => {
  const [listenPort, setListenPort] = useState(DEFAULT_PORT);
  const [sharedSecret, setSharedSecret] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [statusLog, setStatusLog] = useState([]);
  const [activePort, setActivePort] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const logScrollRef = useRef(null);

  useEffect(() => {
    return subscribeToStatus((entry) => {
      setStatusLog((current) => {
        const next = [entry, ...current];
        return next.slice(0, 50);
      });
    });
  }, []);

  useEffect(() => {
    setIsRunning(false);
    startRelay();
  }, []);

  const ensureForegroundServiceReady = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const sdkInt = Number(Platform.Version);
    if (!Number.isNaN(sdkInt) && sdkInt >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Notifications required', 'Grant notification permission to run the foreground service.');
          return false;
        }
      } catch (e) {
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
    if (isRunning) return;

    const ok = await ensureForegroundServiceReady();
    if (!ok) return;

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

  const toggleRelay = () => {
    if (isRunning) stopRelay();
    else startRelay();
  };

  const handleOpenWebUi = useCallback(() => {
    const portNumber = Number(activePort ?? listenPort);
    const url = `http://127.0.0.1:${portNumber}/`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open browser'));
  }, [activePort, listenPort]);

  return (
    <LinearGradient
      colors={['#0f172a', '#1e293b', '#0f172a']}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="light" />
        
        {/* Header */}
        <XStack paddingHorizontal={24} paddingTop={12} justifyContent="space-between" alignItems="center">
          <YStack>
            <SizableText fontFamily="Syne_700Bold" fontSize={32} color="white">WOLE</SizableText>
            <SizableText fontFamily="Manrope_400Regular" fontSize={14} color="rgba(255,255,255,0.5)">Relay Station</SizableText>
          </YStack>
          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <Stack backgroundColor="rgba(255,255,255,0.1)" padding={10} borderRadius={20}>
              <Ionicons name="settings-outline" size={24} color="white" />
            </Stack>
          </TouchableOpacity>
        </XStack>

        {/* Main Content */}
        <YStack flex={1} alignItems="center" justifyContent="center" gap={40}>
          <StatusOrb isRunning={isRunning} onPress={toggleRelay} />
          
          <YStack alignItems="center" gap={8}>
            <SizableText fontFamily="Manrope_600SemiBold" fontSize={18} color="white">
              {isRunning ? `Listening on Port ${activePort}` : 'Service Stopped'}
            </SizableText>
            <SizableText fontFamily="Manrope_400Regular" fontSize={14} color="rgba(255,255,255,0.5)" textAlign="center" maxWidth={280}>
              {isRunning 
                ? 'Ready to forward Wake-on-LAN packets from authorized web clients.' 
                : 'Tap the orb to start the relay service.'}
            </SizableText>
          </YStack>

          {isRunning && (
            <Button
              backgroundColor="rgba(34, 211, 238, 0.15)"
              borderColor="rgba(34, 211, 238, 0.3)"
              borderWidth={1}
              color="#22d3ee"
              icon={<Ionicons name="globe-outline" size={18} color="#22d3ee" />}
              onPress={handleOpenWebUi}
              pressStyle={{ backgroundColor: 'rgba(34, 211, 238, 0.25)' }}
              borderRadius={100}
              paddingHorizontal={24}
            >
              Open Web Dashboard
            </Button>
          )}
        </YStack>

        {/* Footer Actions */}
        <XStack padding={24} justifyContent="center">
          <TouchableOpacity onPress={() => setShowLogs(true)}>
            <XStack alignItems="center" gap={8}>
              <Ionicons name="terminal-outline" size={16} color="rgba(255,255,255,0.5)" />
              <SizableText fontFamily="Manrope_600SemiBold" fontSize={14} color="rgba(255,255,255,0.5)">
                View System Logs
              </SizableText>
            </XStack>
          </TouchableOpacity>
        </XStack>

        {/* Settings Modal */}
        <Modal visible={showSettings} animationType="slide" transparent>
          <Stack flex={1} backgroundColor="rgba(0,0,0,0.8)">
            <Stack flex={1} onPress={() => setShowSettings(false)} />
            <GlassCard style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 40 }}>
              <XStack justifyContent="space-between" alignItems="center" marginBottom={24}>
                <SizableText fontFamily="Syne_700Bold" fontSize={24} color="white">Configuration</SizableText>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </XStack>
              
              <YStack gap={20}>
                <YStack gap={8}>
                  <SizableText color="rgba(255,255,255,0.7)" fontFamily="Manrope_600SemiBold">Listen Port</SizableText>
                  <Input
                    value={listenPort}
                    onChangeText={setListenPort}
                    keyboardType="numeric"
                    backgroundColor="rgba(0,0,0,0.3)"
                    borderColor="rgba(255,255,255,0.1)"
                    color="white"
                    editable={!isRunning}
                  />
                </YStack>
                
                <YStack gap={8}>
                  <SizableText color="rgba(255,255,255,0.7)" fontFamily="Manrope_600SemiBold">Auth Token (Optional)</SizableText>
                  <Input
                    value={sharedSecret}
                    onChangeText={setSharedSecret}
                    secureTextEntry
                    backgroundColor="rgba(0,0,0,0.3)"
                    borderColor="rgba(255,255,255,0.1)"
                    color="white"
                    editable={!isRunning}
                    placeholder="Leave empty for no auth"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </YStack>

                <Button
                  onPress={() => { Linking.openSettings(); }}
                  backgroundColor="rgba(255,255,255,0.1)"
                  color="white"
                  icon={<Ionicons name="battery-charging-outline" size={18} color="white" />}
                >
                  Battery Optimization Settings
                </Button>
              </YStack>
            </GlassCard>
          </Stack>
        </Modal>

        {/* Logs Modal */}
        <Modal visible={showLogs} animationType="slide" transparent>
          <Stack flex={1} backgroundColor="rgba(0,0,0,0.8)">
            <Stack flex={1} onPress={() => setShowLogs(false)} />
            <GlassCard style={{ height: '60%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
              <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
                <SizableText fontFamily="Syne_700Bold" fontSize={20} color="white">System Logs</SizableText>
                <TouchableOpacity onPress={() => setStatusLog([])}>
                  <SizableText color="#ef4444" fontFamily="Manrope_600SemiBold">Clear</SizableText>
                </TouchableOpacity>
              </XStack>
              <ScrollView
                ref={logScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {statusLog.map((log, i) => (
                  <SizableText key={i} fontFamily="monospace" fontSize={12} color="rgba(255,255,255,0.7)" marginBottom={8}>
                    {log}
                  </SizableText>
                ))}
                {statusLog.length === 0 && (
                  <SizableText color="rgba(255,255,255,0.3)" textAlign="center" marginTop={20}>No logs yet.</SizableText>
                )}
              </ScrollView>
              <Button onPress={() => setShowLogs(false)} marginTop={16} backgroundColor="rgba(255,255,255,0.1)" color="white">
                Close
              </Button>
            </GlassCard>
          </Stack>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Syne_700Bold,
    Syne_500Medium,
    Manrope_400Regular,
    Manrope_600SemiBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Theme name="dark">
        <AppContent />
      </Theme>
    </TamaguiProvider>
  );
}
