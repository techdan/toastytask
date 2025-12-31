import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileSortMode, SortDirection } from "../lib/sorting";

/**
 * App settings that persist locally on the device
 * These control display preferences for the mobile app
 */
export interface AppSettings {
  sortMode: MobileSortMode;
  sortDirection: SortDirection;
  density: "comfortable" | "compact";
  badgeMode: "heat" | "importance";
  showCompleted: boolean;
  theme: "light" | "dark" | "system";
}

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: AppSettings = {
  sortMode: "importance",
  sortDirection: "desc",
  density: "comfortable",
  badgeMode: "importance",
  showCompleted: false,
  theme: "system",
};

const STORAGE_KEY = "toasty:app-settings";

/**
 * Actions for the settings reducer
 */
type AppSettingsAction =
  | { type: "SET_SORT_MODE"; payload: MobileSortMode }
  | { type: "SET_SORT_DIRECTION"; payload: SortDirection }
  | { type: "SET_DENSITY"; payload: "comfortable" | "compact" }
  | { type: "SET_BADGE_MODE"; payload: "heat" | "importance" }
  | { type: "SET_SHOW_COMPLETED"; payload: boolean }
  | { type: "SET_THEME"; payload: "light" | "dark" | "system" }
  | { type: "LOAD_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "RESET_SETTINGS" };

function settingsReducer(
  state: AppSettings,
  action: AppSettingsAction
): AppSettings {
  switch (action.type) {
    case "SET_SORT_MODE":
      return { ...state, sortMode: action.payload };
    case "SET_SORT_DIRECTION":
      return { ...state, sortDirection: action.payload };
    case "SET_DENSITY":
      return { ...state, density: action.payload };
    case "SET_BADGE_MODE":
      return { ...state, badgeMode: action.payload };
    case "SET_SHOW_COMPLETED":
      return { ...state, showCompleted: action.payload };
    case "SET_THEME":
      return { ...state, theme: action.payload };
    case "LOAD_SETTINGS":
      return { ...state, ...action.payload };
    case "RESET_SETTINGS":
      return DEFAULT_SETTINGS;
    default:
      return state;
  }
}

/**
 * Context for reading app settings
 */
const AppSettingsContext = createContext<AppSettings | undefined>(undefined);

/**
 * Context for dispatching settings updates
 */
const AppSettingsDispatchContext = createContext<
  React.Dispatch<AppSettingsAction> | undefined
>(undefined);

/**
 * Provider props
 */
interface AppSettingsProviderProps {
  children: ReactNode;
}

/**
 * Provider component for app settings
 * Handles persistence to AsyncStorage
 */
export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
  const [settings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppSettings>;
          dispatch({ type: "LOAD_SETTINGS", payload: parsed });
        }
      } catch (error) {
        console.warn("Failed to load app settings:", error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadSettings();
  }, []);

  // Persist settings to AsyncStorage whenever they change
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    async function saveSettings() {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        console.warn("Failed to save app settings:", error);
      }
    }

    saveSettings();
  }, [settings, isLoaded]);

  return (
    <AppSettingsContext.Provider value={settings}>
      <AppSettingsDispatchContext.Provider value={dispatch}>
        {children}
      </AppSettingsDispatchContext.Provider>
    </AppSettingsContext.Provider>
  );
}

/**
 * Hook to access app settings
 */
export function useAppSettings(): AppSettings {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }
  return context;
}

/**
 * Hook to access settings dispatch
 */
export function useAppSettingsDispatch(): React.Dispatch<AppSettingsAction> {
  const context = useContext(AppSettingsDispatchContext);
  if (context === undefined) {
    throw new Error(
      "useAppSettingsDispatch must be used within an AppSettingsProvider"
    );
  }
  return context;
}

/**
 * Convenience hook for updating individual settings
 * Returns functions to update each setting
 */
export function useAppSettingsUpdaters() {
  const dispatch = useAppSettingsDispatch();

  const setSortMode = useCallback(
    (sortMode: MobileSortMode) => {
      dispatch({ type: "SET_SORT_MODE", payload: sortMode });
    },
    [dispatch]
  );

  const setSortDirection = useCallback(
    (sortDirection: SortDirection) => {
      dispatch({ type: "SET_SORT_DIRECTION", payload: sortDirection });
    },
    [dispatch]
  );

  const setDensity = useCallback(
    (density: "comfortable" | "compact") => {
      dispatch({ type: "SET_DENSITY", payload: density });
    },
    [dispatch]
  );

  const setBadgeMode = useCallback(
    (badgeMode: "heat" | "importance") => {
      dispatch({ type: "SET_BADGE_MODE", payload: badgeMode });
    },
    [dispatch]
  );

  const setShowCompleted = useCallback(
    (showCompleted: boolean) => {
      dispatch({ type: "SET_SHOW_COMPLETED", payload: showCompleted });
    },
    [dispatch]
  );

  const setTheme = useCallback(
    (theme: "light" | "dark" | "system") => {
      dispatch({ type: "SET_THEME", payload: theme });
    },
    [dispatch]
  );

  const resetSettings = useCallback(() => {
    dispatch({ type: "RESET_SETTINGS" });
  }, [dispatch]);

  const toggleBadgeMode = useCallback(() => {
    dispatch({
      type: "SET_BADGE_MODE",
      payload: undefined as unknown as "heat" | "importance",
    });
  }, [dispatch]);

  return {
    setSortMode,
    setSortDirection,
    setDensity,
    setBadgeMode,
    setShowCompleted,
    setTheme,
    resetSettings,
  };
}

/**
 * Hook to toggle badge mode between heat and importance
 */
export function useToggleBadgeMode() {
  const settings = useAppSettings();
  const dispatch = useAppSettingsDispatch();

  return useCallback(() => {
    dispatch({
      type: "SET_BADGE_MODE",
      payload: settings.badgeMode === "heat" ? "importance" : "heat",
    });
  }, [dispatch, settings.badgeMode]);
}
