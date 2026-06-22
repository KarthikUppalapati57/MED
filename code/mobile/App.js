import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './lib/supabaseClient';
import { View, Text, ActivityIndicator, Button } from 'react-native';

// Placeholder screen before we create InventoryScannerScreen
import InventoryScannerScreen from './screens/InventoryScannerScreen';
import VoiceCopilot from './components/VoiceCopilot';

const Stack = createNativeStackNavigator();

function LoginScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Please login on the Web App first</Text>
      <Text style={{ marginTop: 10, color: 'gray', textAlign: 'center', paddingHorizontal: 20 }}>
        In production, this would present a login form to get a session token for field operations.
      </Text>
    </View>
  );
}

function MainDashboard({ navigation }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 20, flex: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Restops Field App</Text>
        <Button 
          title="Open Barcode Scanner" 
          onPress={() => navigation.navigate('InventoryScanner')} 
        />
        <VoiceCopilot />
      </View>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          {session && session.user ? (
            <>
              <Stack.Screen 
                name="Dashboard" 
                component={MainDashboard} 
                options={{ title: 'Restops Mobile' }}
              />
              <Stack.Screen 
                name="InventoryScanner" 
                component={InventoryScannerScreen} 
                options={{ title: 'Scan Barcode' }}
              />
            </>
          ) : (
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }}
            />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
