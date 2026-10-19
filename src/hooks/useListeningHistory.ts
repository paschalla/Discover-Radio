import { useCallback, useEffect, useState } from 'react';
import { Episode, ListeningHistoryItem, PlayerPersistedState } from '../types.ts';

const HISTORY_STORAGE_KEY = 'discover_radio_listening_history';
const RESUME_STORAGE_KEY = 'discover_radio_resume_state';
const SHUFFLE_STORAGE_KEY = 'discover_radio_shuffle_mode';

export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) {
      const min = Math.floor(diffSec / 60);
      return `${min}m ago`;
    }
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours}h ago`;
    }
    if (diffSec < 172800) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return 'Recently';
  }
}

export function useListeningHistory() {
  const [history, setHistory] = useState<Record<string, ListeningHistoryItem>>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to parse listening history:', err);
    }
    return {};
  });

  const [resumeState, setResumeState] = useState<PlayerPersistedState | null>(() => {
    try {
      const saved = localStorage.getItem(RESUME_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to parse resume state:', err);
    }
    return null;
  });

  const [isShuffleMode, setIsShuffleMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHUFFLE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Keep localStorage in sync when history updates
  const persistHistory = useCallback((updated: Record<string, ListeningHistoryItem>) => {
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save listening history:', err);
    }
  }, []);

  // Update listening progress for an episode
  const recordProgress = useCallback(
    (episode: Episode, positionSec: number, durationSec: number, isFinished = false) => {
      if (!episode || positionSec < 1) return;

      const effectiveDuration =
        durationSec > 0 ? durationSec : episode.duration_estimate_sec || 60;
      const completed = isFinished || positionSec >= effectiveDuration * 0.94;

      setHistory((prev) => {
        const existing = prev[episode.id];
        const updatedItem: ListeningHistoryItem = {
          episode_id: episode.id,
          title: episode.title,
          source: episode.source,
          author: episode.author,
          last_played_at: new Date().toISOString(),
          last_position_sec: Math.floor(positionSec),
          duration_sec: Math.floor(effectiveDuration),
          completed: completed || Boolean(existing?.completed),
          play_count: existing ? existing.play_count + (isFinished ? 1 : 0) : 1,
        };

        const updated = {
          ...prev,
          [episode.id]: updatedItem,
        };

        try {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore quota error
        }

        return updated;
      });
    },
    []
  );

  // Save persistent resume state (e.g. on pause or unload)
  const saveResumeState = useCallback(
    (episodeId: string, positionSec: number, wasPaused: boolean) => {
      const state: PlayerPersistedState = {
        episode_id: episodeId,
        position_sec: positionSec,
        was_paused: wasPaused,
        saved_at: new Date().toISOString(),
      };
      setResumeState(state);
      try {
        localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save resume state:', err);
      }
    },
    []
  );

  const clearResumeState = useCallback(() => {
    setResumeState(null);
    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory({});
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffleMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHUFFLE_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Helper to determine unlistened episodes
  const getUnlistenedEpisodes = useCallback(
    (allEpisodes: Episode[]): Episode[] => {
      return allEpisodes.filter((ep) => {
        const item = history[ep.id];
        if (!item) return true;
        // If marked completed or listened > 90%
        if (item.completed) return false;
        if (item.duration_sec > 0 && item.last_position_sec / item.duration_sec >= 0.9) {
          return false;
        }
        return true;
      });
    },
    [history]
  );

  // Intelligent shuffle selector: ignores previously listened episodes UNLESS no new episodes are available
  const getNextShuffleEpisode = useCallback(
    (allEpisodes: Episode[], currentEpisodeId: string | null): Episode | null => {
      if (allEpisodes.length === 0) return null;
      if (allEpisodes.length === 1) return allEpisodes[0];

      // 1. Filter for unlistened episodes
      const unlistened = getUnlistenedEpisodes(allEpisodes).filter(
        (ep) => ep.id !== currentEpisodeId
      );

      if (unlistened.length > 0) {
        const randomIndex = Math.floor(Math.random() * unlistened.length);
        return unlistened[randomIndex];
      }

      // 2. Fallback: if no new/unlistened episodes are available, pick from all remaining episodes
      const pool = allEpisodes.filter((ep) => ep.id !== currentEpisodeId);
      if (pool.length === 0) return allEpisodes[0];

      const randomIndex = Math.floor(Math.random() * pool.length);
      return pool[randomIndex];
    },
    [getUnlistenedEpisodes]
  );

  return {
    history,
    resumeState,
    isShuffleMode,
    recordProgress,
    saveResumeState,
    clearResumeState,
    clearHistory,
    toggleShuffle,
    getUnlistenedEpisodes,
    getNextShuffleEpisode,
  };
}
