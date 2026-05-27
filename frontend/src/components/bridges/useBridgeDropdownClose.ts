import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

type UseBridgeDropdownCloseParams = {
  fromDropdownRef: RefObject<HTMLDivElement>;
  toDropdownRef: RefObject<HTMLDivElement>;
  isFromDropdownOpen: boolean;
  isToDropdownOpen: boolean;
  setIsFromDropdownOpen: Dispatch<SetStateAction<boolean>>;
  setIsToDropdownOpen: Dispatch<SetStateAction<boolean>>;
};

export function useBridgeDropdownClose({
  fromDropdownRef,
  toDropdownRef,
  isFromDropdownOpen,
  isToDropdownOpen,
  setIsFromDropdownOpen,
  setIsToDropdownOpen,
}: UseBridgeDropdownCloseParams) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (fromDropdownRef.current && fromDropdownRef.current.contains(target)) return;
      if (toDropdownRef.current && toDropdownRef.current.contains(target)) return;

      if (isFromDropdownOpen || isToDropdownOpen) {
        setIsFromDropdownOpen(false);
        setIsToDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [
    fromDropdownRef,
    isFromDropdownOpen,
    isToDropdownOpen,
    setIsFromDropdownOpen,
    setIsToDropdownOpen,
    toDropdownRef,
  ]);
}
