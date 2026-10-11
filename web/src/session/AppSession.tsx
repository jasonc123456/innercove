import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * TEMPORARY in-memory UI session.
 * Field names follow packages/core (lock status, diary records, access
 * levels). This module does not call those routes and does not store a
 * passphrase. Sign-in is a practice gate: credentials are checked, then
 * discarded, and are not written to localStorage or sessionStorage.
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
  signedIn: boolean;
  /** False until GET /api/session has answered, so a reload doesn't flash the sign-in page. */
  sessionChecked: boolean;
  chatMode: ChatMode;
  useMemories: boolean;
  entries: DiaryEntry[];
  memories: PracticeMemory[];
  pinnedMemoryIds: string[];
  completeSetup: (passphrase: string, confirm: string) => string | null;
  completeUnlock: (passphrase: string) => string | null;
  /** The demo hub's only account is its admin (D47: one user, the hub owner). */
  role: "admin";
  /** Username or email of the hub's admin plus the hub passphrase (D47): POST /api/session checks
   * both, unlocks the hub if needed, and sets an HttpOnly session cookie. */
  signIn: (login: string, passphrase: string) => Promise<string | null>;
  signOut: () => void;
  createAccount: (email: string, password: string, confirm: string) => string | null;
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

/** The hub's single account (D47), for display; the server checks them. Identifiers aren't secrets; the passphrase is. */
export const ADMIN_LOGINS = ["admin", "admin@innercove.local"] as const;
const SIGN_IN_FAILED = "That username or passphrase didn't work.";

const DEMO_USER_ID = "01900000-0000-7000-8000-000000000001";

const AppSessionContext = createContext<AppSessionValue | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [locked, setLocked] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [chatMode, setChatModeState] = useState<ChatMode>("temporary");
  const [useMemories, setUseMemoriesState] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [memories, setMemories] = useState<PracticeMemory[]>([]);
  const [pinnedMemoryIds, setPinnedMemoryIds] = useState<string[]>([]);

  // A reload keeps the session: the cookie is HttpOnly, so ask the hub.
  useEffect(() => {
    fetch("/api/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { signedIn?: boolean } | null) => {
        if (body?.signedIn) {
          setSignedIn(true);
          setLocked(false);
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []);

  // Any API answer of 401 (session expired or revoked) or 423 (hub restarted and locked)
  // returns to the sign-in page, wherever the call came from (chat stream, diary, panels).
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if ((res.status === 401 || res.status === 423) && url.includes("/api/") && !url.includes("/api/session")) {
        setSignedIn(false);
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const value = useMemo<AppSessionValue>(() => {
    return {
      hasPassphrase,
      locked,
      signedIn,
      sessionChecked,
      role: "admin",
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
      async signIn(login, passphrase) {
        if (login.trim().length === 0) return "Enter your username or email.";
        if (passphrase.length < 1) return "Enter the hub passphrase.";
        let res: Response;
        try {
          res = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: login.trim(), passphrase }),
          });
        } catch {
          return "The hub isn't reachable right now.";
        }
        if (res.ok) {
          setLocked(false);
          setSignedIn(true);
          return null;
        }
        const body = await res.json().catch(() => null);
        if (body?.error?.code === "CONFLICT") return "This hub hasn't been set up yet.";
        // Same message for a wrong username or passphrase, so the page doesn't say which one was wrong.
        const wait = res.headers.get("retry-after");
        return wait ? `Too many attempts. Try again in ${wait} seconds.` : SIGN_IN_FAILED;
      },
      signOut() {
        void fetch("/api/session", { method: "DELETE" }).catch(() => {});
        setSignedIn(false);
      },
      createAccount(email, password, confirm) {
        if (email.trim().length === 0) return "Enter an email.";
        if (password.length < 1) return "Enter a password.";
        if (password !== confirm) return "Those passwords do not match.";
        setSignedIn(true);
        return null;
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
  }, [chatMode, entries, hasPassphrase, locked, memories, pinnedMemoryIds, sessionChecked, signedIn, useMemories]);

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
