import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LiveClient } from '../LiveClient';
import { EventStream } from '../EventStream';

export default function App() {
  const [publicUrl, setPublicUrl] = useState('');
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState('disconnected');
  const [alerts, setAlerts] = useState<string[]>([]);
  
  const clientRef = useRef<any>(null);
  const eventStreamRef = useRef<any>(null);

  const connect = () => {
    if (!publicUrl) return;
    
    const client = new LiveClient(publicUrl);
    client.onStateChange = setStatus;
    client.connect();
    clientRef.current = client;

    const es = new EventStream(publicUrl, (msg: any) => {
      setAlerts(prev => [msg, ...prev].slice(0, 5)); // keep last 5
    });
    es.connect();
    eventStreamRef.current = es;

    setConfigured(true);
  };

  const handlePressIn = () => {
    if (clientRef.current) {
      clientRef.current.startRecording();
    }
  };

  const handlePressOut = () => {
    if (clientRef.current) {
      clientRef.current.stopRecording();
    }
  };

  const getStateColor = () => {
    switch(status) {
      case 'idle': return '#54585f';
      case 'listening': return '#9DB4FF';
      case 'processing': return '#F0C36B';
      case 'speaking': return '#7FE7C4';
      case 'error': return '#ff6b6b';
      default: return '#333';
    }
  };

  if (!configured) {
    return (
      <View style={styles.configContainer}>
        <Text style={styles.title}>JARVIS Mobile</Text>
        <TextInput 
          style={styles.input}
          placeholder="https://your-ngrok-url.app"
          placeholderTextColor="#888"
          value={publicUrl}
          onChangeText={setPublicUrl}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.button} onPress={connect}>
          <Text style={styles.buttonText}>Connect</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.statusText}>{status.toUpperCase()}</Text>
      
      <TouchableOpacity 
        style={[styles.ring, { borderColor: getStateColor() }]}
        activeOpacity={0.7}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={[styles.innerCircle, { backgroundColor: getStateColor() }]} />
      </TouchableOpacity>

      <Text style={styles.hint}>Hold to Speak</Text>

      <ScrollView style={styles.taskQueue}>
        <Text style={styles.queueTitle}>System Alerts & Tasks</Text>
        {alerts.map((a, i) => (
          <View key={i} style={styles.alertBox}>
            <Text style={styles.alertText}>{a}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  configContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#333',
    color: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#9DB4FF',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    paddingTop: 80,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 40,
  },
  ring: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  innerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.8,
  },
  hint: {
    color: '#888',
    marginBottom: 40,
  },
  taskQueue: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
  },
  queueTitle: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertBox: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  alertText: {
    color: '#fff',
    fontSize: 14,
  }
});
