import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * TEMPORARY in-memory UI session.
 * Field names follow packages/core (lock status, diary records, access
 * levels). This module does not call those routes and does not store a
 * passphrase. Nothing here is written to localStorage or sessionStorage.
 */

export type AccessLevel = "private" | "ai_eligible";
export type ChatMode = "temporary" | "saved";

/**
 * TEMPORARY memory rows. Field names follow packages/core MemoryRecord.
 * There is no /api/memories client here.
 */
export type PracticeMemory = {
  id: string;
  userId: string;
  origin: "user";
  status: "approved";
  content: string;
  accessLevel: AccessLevel;
  createdAt: string;
  updatedAt: string;
};

export type DiaryEntry = {
  id: string;
  userId: string;
  origin: "manual";
  title: string | null;
  content: string;
  accessLevel: AccessLevel;
  includeInHandoff: false;
  tags: [];
  mood: null;
  createdAt: string;
  updatedAt: string;
};

type NewDiaryEntry = {
  title: string;
  content: string;
  accessLevel: AccessLevel;
};

type AppSessionValue = {
  hasPassphrase: boolean;
  locked: boolean;
  chatMode: ChatMode;
  useMemories: boolean;
  entries: DiaryEntry[];
  memories: PracticeMemory[];
  pinnedMemoryIds: string[];
  completeSetup: (passphrase: string, confirm: string) => string | null;
  completeUnlock: (passphrase: string) => string | null;
  lock: () => void;
  setChatMode: (mode: ChatMode) => void;
  setUseMemories: (enabled: boolean) => void;
  addEntry: (input: NewDiaryEntry) => void;
  updateEntry: (id: string, input: NewDiaryEntry) => void;
  deleteEntry: (id: string) => void;
  addMemory: (input: { content: string; accessLevel: AccessLevel }) => void;
  updateMemory: (id: string, input: { content: string; accessLevel: AccessLevel }) => void;
  deleteMemory: (id: string) => void;
  pinMemory: (id: string) => string | null;
};

const DEMO_USER_ID = "01900000-0000-7000-8000-000000000001";

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [locked, setLocked] = useState(true);
  const [chatMode, setChatModeState] = useState<ChatMode>("temporary");
  const [useMemories, setUseMemoriesState] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [memories, setMemories] = useState<PracticeMemory[]>([]);
  const [pinnedMemoryIds, setPinnedMemoryIds] = useState<string[]>([]);

  const value = useMemo<AppSessionValue>(() => {
    return {
      hasPassphrase,
      locked,
      chatMode,
      useMemories,
      entries,
      memories,
      pinnedMemoryIds,
      completeSetup(passphrase, confirm) {
        if (passphrase.length < 8) {
          return "Use at least 8 characters.";
        }
        if (passphrase !== confirm) {
          return "Those passphrases do not match.";
        }
        setHasPassphrase(true);
        setLocked(false);
        return null;
      },
      completeUnlock(passphrase) {
        if (passphrase.length < 1) {
          return "Enter a passphrase.";
        }
        setLocked(false);
        return null;
      },
      lock() {
        setLocked(true);
      },
      setChatMode(mode) {
        setChatModeState(mode);
        setUseMemoriesState(mode === "saved");
      },
      setUseMemories(enabled) {
        setUseMemoriesState(enabled);
      },
      addEntry(input) {
        const timestamp = new Date().toISOString();
        setEntries((current) => [
          {
            id: uuidv7(),
            userId: DEMO_USER_ID,
            origin: "manual",
            title: blankToNull(input.title),
            content: input.content,
            accessLevel: input.accessLevel,
            includeInHandoff: false,
            tags: [],
            mood: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          ...current,
        ]);
      },
      updateEntry(id, input) {
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  title: blankToNull(input.title),
                  content: input.content,
                  accessLevel: input.accessLevel,
                  updatedAt: new Date().toISOString(),
                }
              : entry,
          ),
        );
      },
      deleteEntry(id) {
        setEntries((current) => current.filter((entry) => entry.id !== id));
      },
      addMemory(input) {
        const timestamp = new Date().toISOString();
        setMemories((current) => [
          {
            id: uuidv7(),
            userId: DEMO_USER_ID,
            origin: "user",
            status: "approved",
            content: input.content.trim(),
            accessLevel: input.accessLevel,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          ...current,
        ]);
      },
      updateMemory(id, input) {
        setMemories((current) =>
          current.map((memory) =>
            memory.id === id
              ? {
                  ...memory,
                  content: input.content.trim(),
                  accessLevel: input.accessLevel,
                  updatedAt: new Date().toISOString(),
                }
              : memory,
          ),
        );
        if (input.accessLevel === "private") {
          setPinnedMemoryIds((current) => current.filter((pinned) => pinned !== id));
        }
      },
      deleteMemory(id) {
        setMemories((current) => current.filter((memory) => memory.id !== id));
        setPinnedMemoryIds((current) => current.filter((pinned) => pinned !== id));
      },
      pinMemory(id) {
        const memory = memories.find((item) => item.id === id);
        if (!memory || memory.accessLevel !== "ai_eligible") {
          return "Turn on AI access before using this in a chat.";
        }
        if (pinnedMemoryIds.includes(id)) {
          setPinnedMemoryIds((current) => current.filter((pinned) => pinned !== id));
          return null;
        }
        if (pinnedMemoryIds.length >= 5) {
          return "This chat already has 5 memories.";
        }
        setPinnedMemoryIds((current) => [...current, id]);
        setUseMemoriesState(true);
        return null;
      },
    };
  }, [chatMode, entries, hasPassphrase, locked, memories, pinnedMemoryIds, useMemories]);

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSessionValue {
  const value = useContext(AppSessionContext);
  if (!value) {
    throw new Error("AppSessionProvider is missing");
  }
  return value;
}

function blankToNull(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Uses getRandomValues, not crypto.randomUUID, which browsers only expose on HTTPS or localhost (the LAN demo is plain HTTP, D46). */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const now = BigInt(Date.now());
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
