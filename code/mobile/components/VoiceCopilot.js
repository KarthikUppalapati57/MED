import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';

export default function VoiceCopilot() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);

  const simulateVoiceRecording = async () => {
    setIsListening(true);
    setLastResponse(null);
    
    // Simulate speaking time
    setTimeout(async () => {
      setIsListening(false);
      setIsProcessing(true);
      
      try {
        // In reality, this transcript would come from expo-speech or native iOS/Android voice dictation
        const mockTranscript = "We just threw away 5 pounds of spoiled chicken breasts from the walk-in.";
        
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/voice-copilot-parser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ transcript: mockTranscript })
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        const result = await res.json();
        setLastResponse(result.message);
      } catch (e) {
        setLastResponse(`Error: ${e.message}`);
      } finally {
        setIsProcessing(false);
      }
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Copilot</Text>
      
      <TouchableOpacity 
        style={[styles.micButton, isListening ? styles.listening : {}]} 
        onPress={simulateVoiceRecording}
        disabled={isListening || isProcessing}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </TouchableOpacity>
      
      {isListening && <Text style={styles.status}>Listening... (Say: "I threw away 5 lbs of chicken")</Text>}
      {isProcessing && <ActivityIndicator size="small" color="#0000ff" style={styles.loader} />}
      
      {lastResponse && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseText}>{lastResponse}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 15,
    alignItems: 'center',
    margin: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dee2e6'
  },
  listening: {
    backgroundColor: '#ffe3e3',
    borderColor: '#ff6b6b'
  },
  micIcon: {
    fontSize: 32
  },
  status: {
    marginTop: 15,
    color: '#495057',
    fontStyle: 'italic'
  },
  loader: {
    marginTop: 15
  },
  responseContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#d4edda',
    borderRadius: 10,
    width: '100%'
  },
  responseText: {
    color: '#155724',
    textAlign: 'center'
  }
});
