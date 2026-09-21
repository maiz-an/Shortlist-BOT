import { AppProviders } from './app/providers';
import { AppRoutes } from './app/routes';
import { Splash } from './components/Splash';
import { AuthGate } from './features/auth/Auth';

function App() {
  return (
    <AppProviders>
      <Splash />
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </AppProviders>
  );
}

export default App;
