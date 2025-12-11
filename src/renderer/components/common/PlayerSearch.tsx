import { useState, useEffect, useRef } from 'react';
import { DatabaseService } from '../../services/database';
import { Player } from '../../types/player';
import Input from './Input';

interface PlayerSearchProps {
  onSelect: (player: Player) => void;
  excludeIds?: number[];
  placeholder?: string;
}

export default function PlayerSearch({ onSelect, excludeIds = [], placeholder = 'Buscar jugador...' }: PlayerSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchPlayers(searchTerm);
    } else {
      setResults([]);
      setShowResults(false);
    }
  }, [searchTerm]);

  const searchPlayers = async (term: string) => {
    try {
      const players = await DatabaseService.searchPlayers(term);
      const filtered = players.filter((p) => !excludeIds.includes(p.id!));
      setResults(filtered);
      setShowResults(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error searching players:', error);
    }
  };

  const handleSelect = (player: Player) => {
    onSelect(player);
    setSearchTerm('');
    setResults([]);
    setShowResults(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <Input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
        onKeyDown={handleKeyDown}
      />
      {showResults && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map((player, index) => (
            <div
              key={player.id}
              className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                index === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
              }`}
              onClick={() => handleSelect(player)}
            >
              <div className="font-medium">{player.name}</div>
              {player.bga_username && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  BGA: {player.bga_username}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showResults && searchTerm.length >= 2 && results.length === 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4">
          <p className="text-gray-500 dark:text-gray-400">No se encontraron jugadores</p>
        </div>
      )}
    </div>
  );
}



