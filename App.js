import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './navigator/AppNavigator';
import Toaster from './Components/UniversalToaster/Toaster';
import { ThemeProvider, useTheme } from './Services/ThemeContext';

const AppContent = () => {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
      <Toaster />
    </>
  );
};

export default function App() {
  return (
    <NavigationContainer>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </NavigationContainer>
  );
}
