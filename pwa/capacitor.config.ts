import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.concord.smartoffice',
  appName: 'Smart Office',
  webDir: 'dist',
  server: {
    // For development, you can use a live reload URL
    // url: 'http://192.168.1.100:5173',
    // cleartext: true
  },
  ios: {
    // iOS-specific configuration
    contentInset: 'automatic',
    scheme: 'Smart Office'
  },
  android: {
    // Android-specific configuration
  },
  plugins: {
    // Plugin configuration will go here
  }
}

export default config
