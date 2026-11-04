'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { searchSymbols } from '@/lib/api';

const DEBOUNCE_MS = 150;

/**
 * Ticker input with autocomplete from the server's US symbol list.
 * Any typed value is still allowed, e.g. Finnhub crypto symbols like BINANCE:BTCUSDT.
 */
export default function SymbolInput({ id, value, onChange, className }) {
  const listId = useId();
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState('');
  // Set after picking a suggestion so the chosen value doesn't trigger another search.
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }

    const query = value.trim();
    if (!query) {
      setResults([]);
      setError('');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const matches = await searchSymbols(query, { signal: controller.signal });
        setResults(matches);
        setError('');
        setActiveIndex(-1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(err.message);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function select(result) {
    if (result.symbol !== value) {
      skipSearch.current = true;
      onChange(result.symbol);
    }
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && value.trim() !== '' && (results.length > 0 || error);

  return (
    <div className="relative">
      <input
        id={id}
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="AAPL or Apple"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className={className}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-80 w-full min-w-[18rem] overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {error ? (
            <li className="px-3 py-2 text-slate-500">{error}</li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.symbol}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown fires before the input's blur, so the click isn't lost.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(result);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-baseline gap-3 px-3 py-2 ${
                  index === activeIndex ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="w-16 shrink-0 font-semibold text-slate-900">{result.symbol}</span>
                <span className="truncate text-slate-600">{result.name}</span>
                {result.type && result.type !== 'Common Stock' && (
                  <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {result.type}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
