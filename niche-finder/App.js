import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './src/screens/HomeScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import NicheDetailScreen from './src/screens/NicheDetailScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#1e293b' },
          headerTintColor: '#f8fafc',
          headerTitleStyle: { fontWeight: 'bold' },
          cardStyle: { backgroundColor: '#0f172a' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Niche Finder' }} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'النتائج' }} />
        <Stack.Screen name="NicheDetail" component={NicheDetailScreen} options={{ title: 'تفاصيل النيتش' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
