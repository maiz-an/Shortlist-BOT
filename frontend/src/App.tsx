import { AppProviders } from './app/providers';
import { AppRoutes } from './app/routes';
import { Splash } from './components/Splash';

function App() {
  return (
    <AppProviders>
      <Splash />
      <AppRoutes />
    </AppProviders>
  );
}

export default App;
