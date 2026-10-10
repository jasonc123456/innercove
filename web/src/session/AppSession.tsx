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
  completeSetup: (passphrase: string, confirm: string) => string | null;
  completeUnlock: (passphrase: string) => string | null;
  lock: () => void;
  setChatMode: (mode: ChatMode) => void;
  setUseMemories: (enabled: boolean) => void;
  addEntry: (input: NewDiaryEntry) => void;
  updateEntry: (id: string, input: NewDiaryEntry) => void;
  deleteEntry: (id: string) => void;
};

const DEMO_USER_ID = "01900000-0000-7000-8000-000000000001";

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [locked, setLocked] = useState(true);
  const [chatMode, setChatModeState] = useState<ChatMode>("temporary");
  const [useMemories, setUseMemoriesState] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  const value = useMemo<AppSessionValue>(() => {
    return {
      hasPassphrase,
      locked,
      chatMode,
      useMemories,
      entries,
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
    };
  }, [chatMode, entries, hasPassphrase, locked, useMemories]);

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

function uuidv7(): string {
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
