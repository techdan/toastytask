"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyNotesResponseToCache,
  applyOptimisticNotesText,
  saveNotes,
} from "./use-notes-mutations";

export type NotesSaveState = "saved" | "unsaved" | "saving" | "retrying" | "error";

interface NotesDraft {
  text: string;
  updatedAt: number;
}

interface UseNotesAutosaveOptions {
  taskId: number;
  serverText: string;
  debounceMs?: number;
  periodicFlushMs?: number;
  retryMs?: number;
  disabled?: boolean;
  onError?: (error: unknown) => void;
}

const DRAFT_PREFIX = "toasty-task:notes-draft:";
const KEEPALIVE_BODY_LIMIT = 60_000;

function getDraft(storageKey: string): NotesDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotesDraft>;
    return typeof parsed.text === "string" && typeof parsed.updatedAt === "number"
      ? { text: parsed.text, updatedAt: parsed.updatedAt }
      : null;
  } catch {
    return null;
  }
}

function setDraft(storageKey: string, text: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ text, updatedAt: Date.now() }));
  } catch {
    // localStorage can be unavailable or full; server retry still protects the common path.
  }
}

function clearDraft(storageKey: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function useNotesAutosave({
  taskId,
  serverText,
  debounceMs = 400,
  periodicFlushMs = 3000,
  retryMs = 2500,
  disabled = false,
  onError,
}: UseNotesAutosaveOptions) {
  const queryClient = useQueryClient();
  const storageKey = useMemo(() => `${DRAFT_PREFIX}${taskId}`, [taskId]);
  const initialText = useMemo(() => getDraft(storageKey)?.text ?? serverText, [serverText, storageKey]);

  const [text, setTextState] = useState(initialText);
  const [saveState, setSaveState] = useState<NotesSaveState>(
    initialText === serverText ? "saved" : "unsaved"
  );

  const textRef = useRef(initialText);
  const lastAckedTextRef = useRef(serverText);
  const saveStateRef = useRef<NotesSaveState>(initialText === serverText ? "saved" : "unsaved");
  const taskIdRef = useRef(taskId);
  const inFlightTextRef = useRef<string | null>(null);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const needsFollowUpFlushRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const setTrackedSaveState = useCallback((nextState: NotesSaveState) => {
    saveStateRef.current = nextState;
    setSaveState(nextState);
  }, []);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleFlush = useCallback(
    (delayMs = debounceMs) => {
      if (disabled || typeof window === "undefined") return;
      clearDebounceTimer();
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void flushRef.current();
      }, delayMs);
    },
    [clearDebounceTimer, debounceMs, disabled]
  );

  const writeUnsavedDraft = useCallback(
    (nextText: string) => {
      if (nextText === lastAckedTextRef.current) {
        clearDraft(storageKey);
        setTrackedSaveState("saved");
        return;
      }

      setDraft(storageKey, nextText);
      setTrackedSaveState(inFlightTextRef.current ? "saving" : "unsaved");
    },
    [setTrackedSaveState, storageKey]
  );

  const updateText = useCallback(
    (nextText: string) => {
      textRef.current = nextText;
      setTextState(nextText);
      applyOptimisticNotesText(queryClient, taskId, nextText);
      writeUnsavedDraft(nextText);
      scheduleFlush();
    },
    [queryClient, scheduleFlush, taskId, writeUnsavedDraft]
  );

  const sendKeepalive = useCallback(() => {
    if (disabled || typeof window === "undefined") return;

    const latestText = textRef.current;
    if (latestText === lastAckedTextRef.current) return;

    const body = JSON.stringify({ text: latestText });
    if (body.length > KEEPALIVE_BODY_LIMIT) {
      void flushRef.current();
      return;
    }

    try {
      void window.fetch(`/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      });
    } catch {
      // The local draft remains for recovery on the next mount.
    }
  }, [disabled, taskId]);

  const flush = useCallback(async () => {
    if (disabled) return;
    clearDebounceTimer();
    clearRetryTimer();

    const latestText = textRef.current;
    if (latestText === lastAckedTextRef.current) {
      clearDraft(storageKey);
      setTrackedSaveState("saved");
      return;
    }

    if (inFlightTextRef.current) {
      needsFollowUpFlushRef.current = true;
      setTrackedSaveState("saving");
      const currentSave = inFlightPromiseRef.current;
      if (currentSave) {
        await currentSave;
        if (mountedRef.current && textRef.current !== lastAckedTextRef.current) {
          await flushRef.current();
        }
      }
      return;
    }

    inFlightTextRef.current = latestText;
    setTrackedSaveState("saving");

    try {
      const savePromise = saveNotes({ taskId, text: latestText });
      inFlightPromiseRef.current = savePromise.then(
        () => undefined,
        () => undefined
      );
      const response = await savePromise;

      inFlightTextRef.current = null;
      inFlightPromiseRef.current = null;
      if (!mountedRef.current) return;

      lastAckedTextRef.current = latestText;

      if (textRef.current === latestText) {
        applyNotesResponseToCache(queryClient, taskId, response);
        clearDraft(storageKey);
        needsFollowUpFlushRef.current = false;
        setTrackedSaveState("saved");
      } else {
        setDraft(storageKey, textRef.current);
        setTrackedSaveState("unsaved");
        needsFollowUpFlushRef.current = false;
        scheduleFlush(0);
      }
    } catch (error) {
      inFlightTextRef.current = null;
      inFlightPromiseRef.current = null;
      if (!mountedRef.current) return;

      setDraft(storageKey, textRef.current);
      setTrackedSaveState("retrying");
      onError?.(error);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void flushRef.current();
      }, retryMs);
    }
  }, [
    clearDebounceTimer,
    clearRetryTimer,
    disabled,
    onError,
    queryClient,
    retryMs,
    scheduleFlush,
    setTrackedSaveState,
    storageKey,
    taskId,
  ]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    mountedRef.current = true;
    if (textRef.current !== lastAckedTextRef.current) {
      applyOptimisticNotesText(queryClient, taskId, textRef.current);
      scheduleFlush(0);
    }

    return () => {
      mountedRef.current = false;
      clearDebounceTimer();
      clearRetryTimer();
      if (textRef.current !== lastAckedTextRef.current) {
        setDraft(storageKey, textRef.current);
        sendKeepalive();
      }
    };
  }, [clearDebounceTimer, clearRetryTimer, queryClient, scheduleFlush, sendKeepalive, storageKey, taskId]);

  useEffect(() => {
    if (taskIdRef.current === taskId) return;
    taskIdRef.current = taskId;
    clearDebounceTimer();
    clearRetryTimer();

    const draft = getDraft(storageKey);
    const nextText = draft?.text ?? serverText;

    textRef.current = nextText;
    lastAckedTextRef.current = serverText;
    setTextState(nextText);
    applyOptimisticNotesText(queryClient, taskId, nextText);

    if (nextText === serverText) {
      clearDraft(storageKey);
      setTrackedSaveState("saved");
    } else {
      setTrackedSaveState("unsaved");
      scheduleFlush(0);
    }
  }, [
    clearDebounceTimer,
    clearRetryTimer,
    queryClient,
    scheduleFlush,
    serverText,
    setTrackedSaveState,
    storageKey,
    taskId,
  ]);

  useEffect(() => {
    if (serverText === lastAckedTextRef.current) return;
    if (saveStateRef.current !== "saved" || inFlightTextRef.current) return;

    const draft = getDraft(storageKey);
    if (draft && draft.text !== serverText) {
      textRef.current = draft.text;
      setTextState(draft.text);
      applyOptimisticNotesText(queryClient, taskId, draft.text);
      setTrackedSaveState("unsaved");
      scheduleFlush(0);
      return;
    }

    lastAckedTextRef.current = serverText;
    textRef.current = serverText;
    setTextState(serverText);
    applyOptimisticNotesText(queryClient, taskId, serverText);
    clearDraft(storageKey);
    setTrackedSaveState("saved");
  }, [queryClient, scheduleFlush, serverText, setTrackedSaveState, storageKey, taskId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendKeepalive();
      } else if (textRef.current !== lastAckedTextRef.current) {
        scheduleFlush(0);
      }
    };

    const handlePageHide = () => {
      sendKeepalive();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [scheduleFlush, sendKeepalive]);

  useEffect(() => {
    if (periodicFlushMs <= 0 || typeof window === "undefined") return;

    const intervalId = window.setInterval(() => {
      if (!inFlightTextRef.current && textRef.current !== lastAckedTextRef.current) {
        void flushRef.current();
      }
    }, periodicFlushMs);

    return () => window.clearInterval(intervalId);
  }, [periodicFlushMs]);

  useEffect(() => {
    if (needsFollowUpFlushRef.current && !inFlightTextRef.current) {
      needsFollowUpFlushRef.current = false;
      scheduleFlush(0);
    }
  }, [saveState, scheduleFlush]);

  return {
    text,
    saveState,
    updateText,
    flush,
  };
}
