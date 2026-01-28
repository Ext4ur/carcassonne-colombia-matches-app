import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="px-4 py-6">
      <div className="card">
        <h1 className="text-3xl font-bold mb-4">Bienvenido al Gestor de Torneos Carcassonne</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Gestiona tus torneos presenciales de Carcassonne Colombia de manera profesional.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/tournaments"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">🏆 Torneos</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Crea y gestiona torneos clasificatorios o de circuito
            </p>
          </Link>
          <Link
            to="/players"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">👥 Jugadores</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Administra la base de datos de jugadores
            </p>
          </Link>
          <Link
            to="/circuits"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">🔄 Circuitos</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Gestiona circuitos y sus torneos
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}



