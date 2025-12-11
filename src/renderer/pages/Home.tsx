export default function Home() {
  return (
    <div className="px-4 py-6">
      <div className="card">
        <h1 className="text-3xl font-bold mb-4">Bienvenido al Gestor de Torneos Carcassonne</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Gestiona tus torneos presenciales de Carcassonne Colombia de manera profesional.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">🏆 Crear Torneo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Crea un nuevo torneo clasificatorio o de circuito
            </p>
          </div>
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">👥 Gestionar Jugadores</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Administra la base de datos de jugadores
            </p>
          </div>
          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">📊 Ver Estadísticas</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Revisa el historial y estadísticas de torneos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}



