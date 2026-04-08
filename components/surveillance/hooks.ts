import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timeout = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timeout);
    }, [value, delayMs]);

    return debounced;
}

export function usePathname(): [string, (pathname: string) => void] {
    const [pathname, setPathname] = useState(window.location.pathname);

    useEffect(() => {
        const listener = () => setPathname(window.location.pathname);
        window.addEventListener('popstate', listener);
        return () => window.removeEventListener('popstate', listener);
    }, []);

    const navigate = (nextPath: string): void => {
        if (nextPath === window.location.pathname) return;
        window.history.pushState({}, '', nextPath);
        setPathname(nextPath);
    };

    return [pathname, navigate];
}
