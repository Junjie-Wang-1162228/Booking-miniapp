import { useRef, useState } from 'react';

type LockedAction = () => void | Promise<void>;

export function useActionLock() {
  const [lockedActions, setLockedActions] = useState<Record<string, boolean>>({});
  const lockedRef = useRef<Record<string, boolean>>({});

  async function runLocked(actionKey: string, action: LockedAction) {
    if (lockedRef.current[actionKey]) return;

    const nextLocked = { ...lockedRef.current, [actionKey]: true };
    lockedRef.current = nextLocked;
    setLockedActions(nextLocked);

    try {
      await action();
    } finally {
      const nextUnlocked = { ...lockedRef.current };
      delete nextUnlocked[actionKey];
      lockedRef.current = nextUnlocked;
      setLockedActions(nextUnlocked);
    }
  }

  function isActionLocked(actionKey: string) {
    return Boolean(lockedActions[actionKey]);
  }

  return { runLocked, isActionLocked };
}
